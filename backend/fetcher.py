
import os
import time

import requests


class ClimateFetchError(RuntimeError):
    """Raised when a weather provider cannot return usable data."""


CLIMATE_CACHE = {}
CLIMATE_CACHE_TTL_SECONDS = 15 * 60

VISUAL_CROSSING_API_KEY = os.getenv("VISUAL_CROSSING_API_KEY")


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
# GEOCODING
# ============================================================

def get_coordinates(city_name):
    """
    Convert a city name into latitude and longitude.

    Nominatim is used only for geocoding.
    Weather data comes from Visual Crossing.
    """

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

    try:
        response = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=20,
        )

        response.raise_for_status()

        data = response.json()

        if not data:
            print(
                f"[Error] City '{city_name}' not found."
            )
            return None, None, None

        result = data[0]

        lat = float(result["lat"])
        lon = float(result["lon"])

        full_name = format_location(
            result.get("address", {})
        )

        if not full_name:
            full_name = result.get(
                "display_name",
                city_name.strip()
            )

        print(
            f"[Geocoding] {city_name} -> "
            f"{lat}, {lon} -> {full_name}"
        )

        return lat, lon, full_name

    except Exception as error:
        print(
            f"[Error] Geocoding failed: {error}"
        )

        return None, None, None


# ============================================================
# VISUAL CROSSING WEATHER
# ============================================================

def fetch_visual_crossing_weather(lat, lon):
    """
    Fetch weather data from Visual Crossing.

    Returns data in an Open-Meteo-compatible structure so
    processor.py does not need to be changed.
    """

    if not VISUAL_CROSSING_API_KEY:
        raise ClimateFetchError(
            "VISUAL_CROSSING_API_KEY is not configured."
        )

    location = f"{lat},{lon}"

    url = (
        "https://weather.visualcrossing.com/"
        "VisualCrossingWebServices/rest/services/timeline/"
        f"{location}"
    )

    params = {
        "key": VISUAL_CROSSING_API_KEY,
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

    url = (
        "https://air-quality-api.open-meteo.com/"
        "v1/air-quality"
    )

    params = {
        "latitude": lat,
        "longitude": lon,

        "hourly": [
            "pm2_5",
            "pm10",
            "nitrogen_dioxide",
            "carbon_monoxide",
        ],

        "past_days": 7,
        "forecast_days": 3,
        "timezone": "auto",
    }

    headers = {
        "User-Agent": "ClimateAnalysisApp/1.0",
    }

    try:
        response = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=30,
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
# MAIN FUNCTION
# ============================================================

def fetch_climate_data(lat, lon):
    """
    Fetch weather + air-quality data.

    Weather:
        Visual Crossing

    Air Quality:
        Open-Meteo

    The return structure remains compatible with processor.py.
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
    # WEATHER
    # --------------------------------------------------------

    weather_json = fetch_visual_crossing_weather(
        lat,
        lon
    )

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

    climate_data = (
        weather_json,
        air_json,
    )

    CLIMATE_CACHE[cache_key] = (
        time.monotonic(),
        climate_data,
    )

    print(
        "[Success] Climate data prepared successfully."
    )

    return climate_data



