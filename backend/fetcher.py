
"""Climate + air-quality data acquisition.

Telemetry (hourly): yesterday + today + tomorrow (3 days) + 7-day
chart window  -> hourly fetch uses past_days=7, forecast_days=7.
Monthly (3-month) charts -> lightweight DAILY fetch (past 90 days),
never hourly, so provider quota / 429s stay low.

Weather providers (in order of preference):

1. Visual Crossing  - used ONLY when VISUAL_CROSSING_API_KEY is configured.
2. Open-Meteo       - free, keyless fallback AND default provider.

Air quality always comes from Open-Meteo (free, keyless).  If it is
temporarily unavailable the dashboard still works: empty (null)
pollution columns are generated so weather analytics never crash.

Every function returns structures compatible with processor.py.
"""

import os
import time

import requests


class ClimateFetchError(RuntimeError):
    """Raised when a weather provider cannot return usable data."""


HOURLY_PAST_DAYS = 7
HOURLY_FORECAST_DAYS = 7
DAILY_PAST_DAYS = 90
DAILY_FORECAST_DAYS = 7

CLIMATE_CACHE = {}
CLIMATE_CACHE_TTL_SECONDS = 30 * 60
# Serve stale cache (with a warning) for up to 6h when providers
# return 429 / rate-limit, instead of failing the request.
CLIMATE_STALE_MAX_SECONDS = 6 * 60 * 60

# Circuit-breaker: skip Visual Crossing for a while after a 429/quota
# error so every request doesn't waste one VC call + one Open-Meteo call.
_VC_COOLDOWN_UNTIL = 0.0
_VC_COOLDOWN_SECONDS = 10 * 60


def _is_rate_limit_error(error):
    text = str(error).lower()
    return ("rate limit" in text or "rate-limit" in text
            or "429" in text or "quota" in text)


def _get_with_retry(url, params=None, headers=None, timeout=30, tries=3):
    """GET with retries on HTTP 429 (respects Retry-After when present)."""
    last_error = None
    for attempt in range(tries):
        response = requests.get(url, params=params, headers=headers, timeout=timeout)
        if response.status_code != 429:
            return response
        last_error = response
        retry_after = response.headers.get("Retry-After") if hasattr(response, "headers") else None
        try:
            wait = float(retry_after) if retry_after else (2.0 * (attempt + 1))
        except (TypeError, ValueError):
            wait = 2.0 * (attempt + 1)
        wait = min(wait, 20.0)
        print(f"[Warning] HTTP 429, retry {attempt + 1}/{tries} after {wait:.0f}s")
        time.sleep(wait)
    return last_error

def _get_vc_key():
    """Read VC key fresh on every call (picks up key changes after restart)."""
    return (os.getenv("VISUAL_CROSSING_API_KEY") or "").strip() or None


# Kept for backward-compat imports; prefer _get_vc_key().
VISUAL_CROSSING_API_KEY = os.getenv("VISUAL_CROSSING_API_KEY")

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"


CONTINENT_COUNTRY_CODES = {
    "Africa": {
        "dz", "ao", "bj", "bw", "bf", "bi", "cm", "cv", "cf", "td",
        "km", "cg", "cd", "ci", "dj", "eg", "gq", "er", "sz", "et",
        "ga", "gm", "gh", "gn", "gw", "ke", "ls", "lr", "ly", "mg",
        "mw", "ml", "mr", "mu", "ma", "mz", "na", "ne", "ng", "rw",
        "st", "sn", "sc", "sl", "so", "za", "ss", "sd", "tz", "tg",
        "tn", "ug", "zm", "zw"
    },
    "Asia": {
        "af", "am", "az", "bh", "bd", "bt", "bn", "kh", "cn", "cy",
        "ge", "in", "id", "ir", "iq", "il", "jp", "jo", "kz", "kw",
        "kg", "la", "lb", "my", "mv", "mn", "mm", "np", "kp", "om",
        "pk", "ps", "ph", "qa", "sa", "sg", "kr", "lk", "sy", "tw",
        "tj", "th", "tl", "tr", "tm", "ae", "uz", "vn", "ye"
    },
    "Europe": {
        "al", "ad", "at", "by", "be", "ba", "bg", "hr", "cz", "dk",
        "ee", "fi", "fr", "de", "gr", "hu", "is", "ie", "it", "xk",
        "lv", "li", "lt", "lu", "mt", "md", "mc", "me", "nl", "mk",
        "no", "pl", "pt", "ro", "ru", "sm", "rs", "sk", "si", "es",
        "se", "ch", "ua", "gb", "va"
    },
    "North America": {
        "ag", "bs", "bb", "bz", "ca", "cr", "cu", "dm", "do", "sv",
        "gd", "gt", "ht", "hn", "jm", "mx", "ni", "pa", "kn", "lc",
        "vc", "tt", "us"
    },
    "South America": {
        "ar", "bo", "br", "cl", "co", "ec", "gy", "py", "pe", "sr",
        "uy", "ve"
    },
    "Oceania": {
        "au", "fj", "ki", "mh", "fm", "nr", "nz", "pw", "pg", "ws",
        "sb", "to", "tv", "vu"
    }
}


def get_continent(country_code):
    normalized_code = (country_code or "").lower()

    return next(
        (
            continent
            for continent, country_codes in CONTINENT_COUNTRY_CODES.items()
            if normalized_code in country_codes
        ),
        "",
    )


def format_location(address):
    """Build a concise location name."""

    place = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or address.get("county")
    )

    state = address.get("state") or address.get("region")
    country = address.get("country")
    continent = get_continent(address.get("country_code"))

    parts = []

    for value in (place, state, country, continent):
        if value and value.casefold() not in {
            part.casefold() for part in parts
        }:
            parts.append(value)

    return ", ".join(parts)


# ============================================================
# GEOCODING (Nominatim primary, Open-Meteo fallback)
# ============================================================

def _geocode_with_nominatim(city_name):
    url = "https://nominatim.openstreetmap.org/search"

    params = {
        "q": city_name.strip(),
        "format": "json",
        "limit": 1,
        "addressdetails": 1,
        "accept-language": "en",
    }

    headers = {
        "User-Agent": (
            "ClimateAnalysisApp/1.0 "
            "(Weather Analysis Project)"
        ),
        "Accept-Language": "en",
    }

    response = requests.get(
        url,
        params=params,
        headers=headers,
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()

    if not data:
        return None

    result = data[0]
    full_name = format_location(result.get("address", {}))
    if not full_name:
        full_name = result.get("display_name", city_name.strip())

    return float(result["lat"]), float(result["lon"]), full_name


def _geocode_with_open_meteo(city_name):
    """Keyless fallback geocoder (no strict User-Agent policy)."""
    response = requests.get(
        OPEN_METEO_GEOCODING_URL,
        params={
            "name": city_name.strip(),
            "count": 1,
            "language": "en",
            "format": "json",
        },
        headers={"User-Agent": "ClimateAnalysisApp/1.0"},
        timeout=20,
    )
    response.raise_for_status()
    data = response.json() or {}
    results = data.get("results") or []
    if not results:
        return None

    best = results[0]
    parts = [
        best.get("name"),
        best.get("admin1"),
        best.get("country"),
    ]
    full_name = ", ".join(p for p in parts if p) or city_name.strip()
    return float(best["latitude"]), float(best["longitude"]), full_name


def get_coordinates(city_name):
    """
    Convert a city name into latitude and longitude.

    Tries Nominatim first, then falls back to the Open-Meteo
    geocoding API (important on cloud hosts where Nominatim
    sometimes rate-limits shared IPs).
    """

    if not city_name or not city_name.strip():
        return None, None, None

    cleaned = city_name.strip()

    for provider_name, provider in (
        ("Nominatim", _geocode_with_nominatim),
        ("Open-Meteo geocoding", _geocode_with_open_meteo),
    ):
        try:
            resolved = provider(cleaned)
        except Exception as error:
            print(f"[Warning] {provider_name} geocoding failed: {error}")
            continue

        if resolved:
            lat, lon, full_name = resolved
            print(f"[Geocoding] {cleaned} -> {lat}, {lon} -> {full_name}")
            return lat, lon, full_name

    print(f"[Error] City '{cleaned}' not found.")
    return None, None, None


# ============================================================
# OPEN-METEO WEATHER (free, no API key required)
# ============================================================

def fetch_open_meteo_weather(lat, lon):
    """Fetch weather data from Open-Meteo (keyless)."""

    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": [
            "temperature_2m",
            "relative_humidity_2m",
            "surface_pressure",
            "wind_speed_10m",
            "precipitation_probability",
            "precipitation",
        ],
        # Hourly window: past 7 + next 7 days (~14 days hourly).
        # Covers Telemetry 3-day dropdown (yesterday/today/tomorrow)
        # + Daily 7-day chart. Monthly 3-month chart uses the
        # lightweight DAILY fetch below, not hourly.
        "past_days": HOURLY_PAST_DAYS,
        "forecast_days": HOURLY_FORECAST_DAYS,
        "timezone": "auto",
        "wind_speed_unit": "kmh",
    }

    try:
        response = _get_with_retry(
            OPEN_METEO_FORECAST_URL,
            params=params,
            headers={"User-Agent": "ClimateAnalysisApp/1.0"},
            timeout=30,
            tries=3,
        )

        if response.status_code == 429:
            raise ClimateFetchError(
                "Open-Meteo weather API is currently rate-limited. "
                "Please retry in a minute."
            )

        response.raise_for_status()
        data = response.json() or {}
        hourly = data.get("hourly") or {}

        required = (
            "time", "temperature_2m", "relative_humidity_2m",
            "surface_pressure", "wind_speed_10m",
            "precipitation_probability", "precipitation",
        )
        if not hourly.get("time") or any(k not in hourly for k in required):
            raise ClimateFetchError(
                "Open-Meteo returned no hourly weather data."
            )

        print("[Success] Open-Meteo weather data fetched.")
        return {"hourly": {key: hourly[key] for key in required}}

    except ClimateFetchError:
        raise
    except requests.Timeout as error:
        raise ClimateFetchError(
            "Open-Meteo weather request timed out."
        ) from error
    except requests.RequestException as error:
        raise ClimateFetchError(
            f"Open-Meteo weather request failed: {error}"
        ) from error
    except Exception as error:
        raise ClimateFetchError(
            f"Invalid Open-Meteo response: {error}"
        ) from error


# ============================================================
# VISUAL CROSSING WEATHER (optional, needs API key)
# ============================================================

def fetch_visual_crossing_weather(lat, lon):
    """
    Fetch weather data from Visual Crossing.

    Returns data in an Open-Meteo-compatible structure so
    processor.py does not need to be changed.
    """

    vc_key = _get_vc_key()
    if not vc_key:
        raise ClimateFetchError(
            "VISUAL_CROSSING_API_KEY is not configured."
        )

    from datetime import date, timedelta

    location = f"{lat},{lon}"

    # Hourly window: past 7 + next 7 days. Telemetry needs only
    # yesterday/today/tomorrow; Daily chart needs last 7 days.
    # Monthly 3-month chart uses the lightweight DAILY fetch.
    start_date = (date.today() - timedelta(days=HOURLY_PAST_DAYS)).isoformat()
    end_date = (date.today() + timedelta(days=HOURLY_FORECAST_DAYS)).isoformat()

    url = (
        "https://weather.visualcrossing.com/"
        "VisualCrossingWebServices/rest/services/timeline/"
        f"{location}/{start_date}/{end_date}"
    )

    params = {
        "key": vc_key,
        "unitGroup": "metric",
        "include": "days,hours",
        "elements": (
            "datetime,"
            "temp,"
            "humidity,"
            "pressure,"
            "windspeed,"
            "precipprob,"
            "precip"
        ),
        "contentType": "json",
    }

    try:
        response = requests.get(
            url,
            params=params,
            timeout=30,
        )

        if response.status_code == 401:
            raise ClimateFetchError(
                "Visual Crossing API key is invalid."
            )

        if response.status_code == 429:
            raise ClimateFetchError(
                "Visual Crossing API rate limit reached."
            )

        response.raise_for_status()

        data = response.json()

        if "days" not in data:
            raise ClimateFetchError(
                "Visual Crossing returned no weather data."
            )

        times = []
        temperatures = []
        humidities = []
        pressures = []
        wind_speeds = []
        rain_probabilities = []
        precipitation = []

        # ----------------------------------------------------
        # Convert Visual Crossing daily/hourly response
        # into the structure expected by processor.py
        # ----------------------------------------------------

        for day in data.get("days", []):

            for hour in day.get("hours", []):

                date_value = day.get("datetime")
                time_value = hour.get("datetime")

                if not date_value or not time_value:
                    continue

                timestamp = f"{date_value} {time_value}"

                times.append(timestamp)

                temperatures.append(
                    hour.get("temp")
                )

                humidities.append(
                    hour.get("humidity")
                )

                pressures.append(
                    hour.get("pressure")
                )

                wind_speeds.append(
                    hour.get("windspeed")
                )

                rain_probabilities.append(
                    hour.get("precipprob", 0)
                )

                precipitation.append(
                    hour.get("precip", 0)
                )

        if not times:
            raise ClimateFetchError(
                "Visual Crossing returned no hourly weather data."
            )

        weather_json = {
            "hourly": {
                "time": times,
                "temperature_2m": temperatures,
                "relative_humidity_2m": humidities,
                "surface_pressure": pressures,
                "wind_speed_10m": wind_speeds,
                "precipitation_probability": rain_probabilities,
                "precipitation": precipitation,
            }
        }

        print(
            "[Success] Visual Crossing weather data fetched."
        )

        return weather_json

    except ClimateFetchError:
        raise

    except requests.Timeout as error:
        raise ClimateFetchError(
            "Visual Crossing weather request timed out."
        ) from error

    except requests.RequestException as error:
        raise ClimateFetchError(
            f"Visual Crossing weather request failed: {error}"
        ) from error

    except Exception as error:
        raise ClimateFetchError(
            f"Invalid Visual Crossing response: {error}"
        ) from error


# ============================================================
# OPEN-METEO AIR QUALITY
# ============================================================

def fetch_air_quality(lat, lon):
    """
    Fetch air-quality data from Open-Meteo.

    This is kept separate from the weather provider.
    """

    params = {
        "latitude": lat,
        "longitude": lon,

        "hourly": [
            "pm2_5",
            "pm10",
            "nitrogen_dioxide",
            "carbon_monoxide",
        ],

        # Match the hourly weather window: past 7 + next 7 days.
        "past_days": HOURLY_PAST_DAYS,
        "forecast_days": HOURLY_FORECAST_DAYS,
        "timezone": "auto",
    }

    headers = {
        "User-Agent": "ClimateAnalysisApp/1.0",
    }

    try:
        response = _get_with_retry(
            OPEN_METEO_AIR_QUALITY_URL,
            params=params,
            headers=headers,
            timeout=30,
            tries=3,
        )

        if response.status_code == 429:
            raise ClimateFetchError(
                "Open-Meteo air-quality API is currently "
                "rate-limited."
            )

        response.raise_for_status()

        data = response.json()

        if "hourly" not in data:
            raise ClimateFetchError(
                "Open-Meteo air-quality API returned "
                "no hourly data."
            )

        print(
            "[Success] Air-quality data fetched."
        )

        return data

    except ClimateFetchError:
        raise

    except requests.Timeout as error:
        raise ClimateFetchError(
            "Air-quality request timed out."
        ) from error

    except requests.RequestException as error:
        raise ClimateFetchError(
            f"Air-quality request failed: {error}"
        ) from error


# ============================================================
# FALLBACK AIR QUALITY
# ============================================================

def create_empty_air_quality(weather_json):
    """
    Create safe empty air-quality values if the air-quality
    provider is temporarily unavailable.

    This prevents the entire weather dashboard from failing.
    """

    times = weather_json["hourly"]["time"]

    empty_values = [None] * len(times)

    return {
        "hourly": {
            "time": times,
            "pm2_5": empty_values,
            "pm10": empty_values,
            "nitrogen_dioxide": empty_values,
            "carbon_monoxide": empty_values,
        }
    }



# ============================================================
# DAILY HISTORY FOR MONTHLY (3-MONTH) CHARTS — lightweight
# ============================================================

def fetch_daily_history(lat, lon):
    """Fetch ~90-day daily means for the Monthly 3-month chart.

    Tiny payload (~97 daily rows, not hourly), keyless Open-Meteo.
    NEVER fails the whole request: returns [] on rate-limit so
    Telemetry (3-day) + Daily 7-day chart still work.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": [
            "temperature_2m_mean",
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "precipitation_probability_mean",
        ],
        "past_days": DAILY_PAST_DAYS,
        "forecast_days": DAILY_FORECAST_DAYS,
        "timezone": "auto",
    }
    try:
        response = _get_with_retry(
            OPEN_METEO_FORECAST_URL,
            params=params,
            headers={"User-Agent": "ClimateAnalysisApp/1.0"},
            timeout=30,
            tries=2,
        )
        if response.status_code == 429:
            print("[Warning] Daily history rate-limited, monthly chart will fallback.")
            return []
        response.raise_for_status()
        data = response.json() or {}
        daily = data.get("daily") or {}
        times = daily.get("time") or []
        if not times:
            return []
        out = []
        n = len(times)
        for i in range(n):
            def _at(key):
                vals = daily.get(key) or []
                return vals[i] if i < len(vals) else None
            out.append({
                "date": times[i],
                "avg_temp": _at("temperature_2m_mean"),
                "max_temp": _at("temperature_2m_max"),
                "min_temp": _at("temperature_2m_min"),
                "precipitation": _at("precipitation_sum"),
                "rain_probability": _at("precipitation_probability_mean"),
            })
        print(f"[Success] Daily history fetched ({len(out)} days).")
        return out
    except Exception as error:
        print(f"[Warning] Daily history unavailable: {error}")
        return []


# ============================================================
# MAIN FUNCTION
# ============================================================

def _resolve_weather(lat, lon):
    """Visual Crossing when a key exists, otherwise Open-Meteo.

    If Visual Crossing is configured but fails (bad key, quota,
    outage), automatically falls back to Open-Meteo so the API
    never goes down because of one provider.
    """
    global _VC_COOLDOWN_UNTIL

    visual_crossing_error = None

    if _get_vc_key():
        if time.monotonic() < _VC_COOLDOWN_UNTIL:
            visual_crossing_error = ClimateFetchError(
                "Visual Crossing cooling down after rate limit."
            )
            print("[Warning] Skipping Visual Crossing (cooldown).")
        else:
            try:
                return fetch_visual_crossing_weather(lat, lon), "visual-crossing"
            except ClimateFetchError as error:
                visual_crossing_error = error
                print(f"[Warning] Visual Crossing unavailable: {error}")
                print("[Warning] Falling back to Open-Meteo weather.")
                if _is_rate_limit_error(error):
                    _VC_COOLDOWN_UNTIL = time.monotonic() + _VC_COOLDOWN_SECONDS

    try:
        return fetch_open_meteo_weather(lat, lon), "open-meteo"
    except ClimateFetchError as error:
        if visual_crossing_error is not None:
            raise ClimateFetchError(
                f"Weather providers unavailable. "
                f"Visual Crossing: {visual_crossing_error} "
                f"Open-Meteo: {error}"
            ) from error
        raise


def fetch_climate_data(lat, lon):
    """
    Fetch weather + air-quality data.

    Weather:
        Visual Crossing (if VISUAL_CROSSING_API_KEY is set),
        otherwise Open-Meteo (free, no key required).

    Air Quality:
        Open-Meteo (with graceful null fallback).

    Daily history (90-day daily means for Monthly 3-month chart):
        Open-Meteo daily, best-effort [] on rate-limit.

    Returns (weather_json, air_json, daily_history).
    For backward-compat, callers may unpack only the first 2.
    """

    cache_key = (
        round(lat, 4),
        round(lon, 4),
    )

    # --------------------------------------------------------
    # CACHE
    # --------------------------------------------------------

    cached_entry = CLIMATE_CACHE.get(cache_key)

    if cached_entry:

        cached_at, cached_data = cached_entry

        if (
            time.monotonic() - cached_at
            < CLIMATE_CACHE_TTL_SECONDS
        ):

            print(
                "[Cache] Returning cached climate data."
            )

            return cached_data

    # --------------------------------------------------------
    # WEATHER (Visual Crossing -> Open-Meteo fallback)
    # with stale-cache fallback on rate limits
    # --------------------------------------------------------

    try:
        weather_json, weather_source = _resolve_weather(lat, lon)
        print(f"[Info] Weather source: {weather_source}")
    except ClimateFetchError as error:
        if cached_entry is not None:
            cached_at, cached_data = cached_entry
            if time.monotonic() - cached_at < CLIMATE_STALE_MAX_SECONDS:
                print(f"[Warning] Providers rate-limited, serving stale cache: {error}")
                return cached_data
        raise

    # --------------------------------------------------------
    # AIR QUALITY
    # --------------------------------------------------------

    try:

        air_json = fetch_air_quality(
            lat,
            lon
        )

    except ClimateFetchError as error:

        print(
            "[Warning] Air-quality unavailable: "
            f"{error}"
        )

        print(
            "[Warning] Continuing with weather data."
        )

        air_json = create_empty_air_quality(
            weather_json
        )

    # --------------------------------------------------------
    # CACHE
    # --------------------------------------------------------

    try:
        daily_history = fetch_daily_history(lat, lon)
    except Exception:
        daily_history = []

    climate_data = (
        weather_json,
        air_json,
        daily_history,
    )

    CLIMATE_CACHE[cache_key] = (
        time.monotonic(),
        climate_data,
    )

    print(
        "[Success] Climate data prepared successfully."
    )

    return climate_data

