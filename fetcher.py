import requests


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
      if value and value.casefold() not in {part.casefold() for part in parts}:
        parts.append(value)

  return ", ".join(parts)


def get_coordinates(city_name):
  """Converts city string into latitude and longitude using OpenStreetMap's geocoding API."""
  url = "https://nominatim.openstreetmap.org/search"
  params = {
    "q": city_name,
    "format": "json",
    "limit": 1,
    "addressdetails": 1,
    "accept-language": "en",
  }
  headers = {
    "User-Agent": "ClimateAnalysisApp/1.0",
    "Accept-Language": "en",
  }

  try:
    response = requests.get(
      url,
      params=params,
      headers=headers,
      timeout=10,
    )
    response.raise_for_status()
    data = response.json()

    if not data:
      raise ValueError(f"City '{city_name}' not found.")

    lat = float(data[0]["lat"])
    lon = float(data[0]["lon"])
    full_name = format_location(data[0].get("address", {}))
    if not full_name:
      full_name = data[0].get("display_name", city_name)
    return lat, lon, full_name
  except Exception as e:
    print(f"[Error] Geocoding failed: {e}")
    return None, None, None


def fetch_climate_data(lat, lon):
  """Fetches weather and air-quality data from Open-Meteo."""
  weather_url = "https://api.open-meteo.com/v1/forecast"
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
      "past_days": 30,
      "forecast_days": 7,
  }

  air_url = "https://air-quality-api.open-meteo.com/v1/air-quality"
  air_params = {
      "latitude": lat,
      "longitude": lon,
      "hourly": [
          "pm2_5",
          "pm10",
          "nitrogen_dioxide",
          "carbon_monoxide",
      ],
      "past_days": 30,
      "forecast_days": 7,
  }

  try:
    headers = {"User-Agent": "ClimateAnalysisApp/1.0"}
    res_weather = requests.get(
        weather_url,
        params=weather_params,
        headers=headers,
        timeout=20,
    )
    res_weather.raise_for_status()
    weather_json = res_weather.json()

    try:
      res_air = requests.get(
          air_url,
          params=air_params,
          headers=headers,
          timeout=20,
      )
      res_air.raise_for_status()
      air_json = res_air.json()
    except requests.RequestException as first_air_error:
      # A shorter air-quality window avoids occasional upstream quota failures.
      fallback_air_params = {**air_params, "past_days": 7}
      print(f"[Warning] Full air-quality request failed: {first_air_error}")
      res_air = requests.get(
          air_url,
          params=fallback_air_params,
          headers=headers,
          timeout=20,
      )
      res_air.raise_for_status()
      air_json = res_air.json()

    if "hourly" not in weather_json:
      raise KeyError(
          f"Weather API Error: {weather_json.get('reason', 'Unknown error')}"
      )
    if "hourly" not in air_json:
      raise KeyError(
          f"Air Quality API Error: {air_json.get('reason', 'Unknown error')}"
      )

    return weather_json, air_json

  except Exception as e:
    print(f"[Error] Open-Meteo fetch failed for {lat},{lon}: {e}")
    return None, None