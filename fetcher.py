
import time

import requests


class ClimateFetchError(RuntimeError):
    """Raised when an upstream climate provider cannot return usable data."""


CLIMATE_CACHE = {}
CLIMATE_CACHE_TTL_SECONDS = 15 * 60


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
    """Build a concise English place, state, country, continent label."""

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


def get_coordinates(city_name):
    """Convert a city name into latitude and longitude using Nominatim."""

    url = "https://nominatim.openstreetmap.org/search"

    params = {
        "q": city_name,
        "format": "json",
        "limit": 1,
        "addressdetails": 1,
        "accept-language": "en",
    }

    headers = {
        "User-Agent": "ClimateAnalysisApp/1.0 (Weather Analysis Project)",
        "Accept-Language": "en",
    }

    try:
        response = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=30,
        )

        response.raise_for_status()

        data = response.json()

        if not data:
            raise ValueError(f"City '{city_name}' not found.")

        lat = float(data[0]["lat"])
        lon = float(data[0]["lon"])

        full_name = format_location(
            data[0].get("address", {})
        )

        if not full_name:
            full_name = data[0].get(
                "display_name",
                city_name
            )

        return lat, lon, full_name

    except Exception as e:
        print(f"[Error] Geocoding failed: {e}")
        return None, None, None


def _get_retry_delay(response, attempt):
    """Calculate a safe retry delay for rate-limited requests."""

    retry_after = response.headers.get("Retry-After")

    if retry_after:
        try:
            return min(int(retry_after), 60)
        except ValueError:
            pass

    # Exponential backoff:
    # attempt 0 -> 5 seconds
    # attempt 1 -> 10 seconds
    # attempt 2 -> 20 seconds
    return min(5 * (2 ** attempt), 60)


def _request_open_meteo(url, params, headers, label):
    """Make an Open-Meteo request with 429 retry handling."""

    max_attempts = 3

    for attempt in range(max_attempts):
        try:
            response = requests.get(
                url,
                params=params,
                headers=headers,
                timeout=30,
            )

            if response.status_code == 429:
                if attempt < max_attempts - 1:
                    wait_seconds = _get_retry_delay(
                        response,
                        attempt,
                    )

                    print(
                        f"[Warning] {label} rate limit reached "
                        f"(429). Retrying in "
                        f"{wait_seconds} seconds..."
                    )

                    time.sleep(wait_seconds)
                    continue

                raise ClimateFetchError(
                    f"{label} is temporarily rate-limited "
                    f"(HTTP 429). Please try again shortly."
                )

            response.raise_for_status()

            return response.json()

        except requests.Timeout as error:
            if attempt < max_attempts - 1:
                wait_seconds = 3 * (attempt + 1)

                print(
                    f"[Warning] {label} timed out. "
                    f"Retrying in {wait_seconds} seconds..."
                )

                time.sleep(wait_seconds)
                continue

            raise ClimateFetchError(
                f"{label} request timed out."
            ) from error

        except requests.RequestException as error:
            raise ClimateFetchError(
                f"{label} request failed: {error}"
            ) from error

    raise ClimateFetchError(
        f"{label} request failed after retries."
    )


def fetch_climate_data(lat, lon):
    """Fetch weather and air-quality data from Open-Meteo."""

    cache_key = (
        round(lat, 4),
        round(lon, 4),
    )

    # ---------------------------------------------------------
    # CHECK CACHE
    # ---------------------------------------------------------

    cached_entry = CLIMATE_CACHE.get(cache_key)

    if cached_entry:
        cached_at, cached_data = cached_entry

        if (
            time.monotonic() - cached_at
            < CLIMATE_CACHE_TTL_SECONDS
        ):
            print("[Cache] Returning fresh climate data.")
            return cached_data

    # ---------------------------------------------------------
    # OPEN-METEO WEATHER
    # ---------------------------------------------------------

    weather_url = (
        "https://api.open-meteo.com/v1/forecast"
    )

    weather_params = {
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

        "past_days": 7,
        "forecast_days": 3,

        # Automatically use the timezone
        # of the requested location.
        "timezone": "auto",
    }

    # ---------------------------------------------------------
    # OPEN-METEO AIR QUALITY
    # ---------------------------------------------------------

    air_url = (
        "https://air-quality-api.open-meteo.com/v1/air-quality"
    )

    air_params = {
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
        "User-Agent": "ClimateAnalysisApp/1.0"
    }

    try:

        # -----------------------------------------------------
        # WEATHER REQUEST
        # -----------------------------------------------------

        weather_json = _request_open_meteo(
            weather_url,
            weather_params,
            headers,
            "Open-Meteo weather API",
        )

        # -----------------------------------------------------
        # AIR QUALITY REQUEST
        # -----------------------------------------------------

        try:

            air_json = _request_open_meteo(
                air_url,
                air_params,
                headers,
                "Open-Meteo air-quality API",
            )

        except ClimateFetchError as first_air_error:

            print(
                "[Warning] Full air-quality request failed: "
                f"{first_air_error}"
            )

            # Smaller fallback request.
            fallback_air_params = {
                **air_params,
                "past_days": 0,
                "forecast_days": 3,
            }

            air_json = _request_open_meteo(
                air_url,
                fallback_air_params,
                headers,
                "Open-Meteo fallback air-quality API",
            )

        # -----------------------------------------------------
        # VALIDATE WEATHER DATA
        # -----------------------------------------------------

        if "hourly" not in weather_json:

            raise ClimateFetchError(
                "Weather API returned no hourly data: "
                f"{weather_json.get('reason', 'Unknown error')}"
            )

        # -----------------------------------------------------
        # VALIDATE AIR QUALITY DATA
        # -----------------------------------------------------

        if "hourly" not in air_json:

            raise ClimateFetchError(
                "Air Quality API returned no hourly data: "
                f"{air_json.get('reason', 'Unknown error')}"
            )

        # -----------------------------------------------------
        # STORE DATA
        # -----------------------------------------------------

        climate_data = (
            weather_json,
            air_json,
        )

        CLIMATE_CACHE[cache_key] = (
            time.monotonic(),
            climate_data,
        )

        print(
            "[Success] Climate data fetched successfully."
        )

        return climate_data

    except ClimateFetchError as error:

        print(
            f"[Error] {error}"
        )

        # -----------------------------------------------------
        # USE STALE CACHE IF AVAILABLE
        # -----------------------------------------------------

        if cached_entry:

            print(
                "[Warning] Returning stale cached "
                "climate data."
            )

            return cached_entry[1]

        raise

    except Exception as error:

        message = (
            f"Open-Meteo fetch failed for "
            f"{lat},{lon}: {error}"
        )

        print(
            f"[Error] {message}"
        )

        # -----------------------------------------------------
        # USE STALE CACHE IF AVAILABLE
        # -----------------------------------------------------

        if cached_entry:

            print(
                "[Warning] Returning stale cached "
                "climate data."
            )

            return cached_entry[1]

        raise ClimateFetchError(
            message
        ) from error

