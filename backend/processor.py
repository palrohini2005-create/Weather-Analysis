

# processor.py
from datetime import datetime
import pandas as pd


def process_raw_data(weather_json, air_json):
  if not weather_json or not air_json:
    raise ValueError("Invalid or empty data received from APIs.")

  df_weather = pd.DataFrame({
      "time": pd.to_datetime(weather_json["hourly"]["time"]),
      "temperature": weather_json["hourly"]["temperature_2m"],
      "humidity": weather_json["hourly"]["relative_humidity_2m"],
      "pressure": weather_json["hourly"]["surface_pressure"],
      "wind_speed": weather_json["hourly"]["wind_speed_10m"],
        "rain_probability": weather_json["hourly"]["precipitation_probability"],
        "precipitation": weather_json["hourly"]["precipitation"],
  })

  df_air = pd.DataFrame({
      "time": pd.to_datetime(air_json["hourly"]["time"]),
      "pm2_5": air_json["hourly"]["pm2_5"],
      "pm10": air_json["hourly"]["pm10"],
      "no2": air_json["hourly"]["nitrogen_dioxide"],
        "co": air_json["hourly"]["carbon_monoxide"],
  })

  # Outer merge keeps the full hourly window (past 7 + next 7 days) even where
  # air-quality hours are missing (provider gaps, shorter forecast).
  # Missing pollution values are interpolated so charts stay continuous.
  df = pd.merge(df_weather, df_air, on="time", how="outer")
  df = df.sort_values("time").reset_index(drop=True)
  df = df.interpolate(method="linear", limit_direction="both")

  df["temp_24h_ma"] = df["temperature"].rolling(window=24, min_periods=1).mean()
  df["pm2_5_24h_ma"] = df["pm2_5"].rolling(window=24, min_periods=1).mean()

  df["date"] = df["time"].dt.date
  df["hour"] = df["time"].dt.hour
  df["high_wind_alert"] = df["wind_speed"] > 20.0

  return df


# processor.py


def get_date_hourly_data(df, target_date_str=None):
  """Filters hourly dataframe for a specific date (YYYY-MM-DD).

  Defaults to today if no date is provided.
  """
  if not target_date_str:
    target_date_str = datetime.now().strftime('%Y-%m-%d')

  df['date_str'] = pd.to_datetime(df['time']).dt.strftime('%Y-%m-%d')
  df_date = df[df['date_str'] == target_date_str].copy()

  # Fallback if selected date isn't found in dataset
  if df_date.empty:
    df_date = df.tail(24).copy()

  if 'date_str' in df_date.columns:
    df_date = df_date.drop(columns=['date_str'])

  return df_date


def calculate_pm25_aqi(pm25):
  """Converts PM2.5 concentration to a 0-500 AQI value."""
  breakpoints = [
      (0, 12, 0, 50),
      (12.1, 35.4, 51, 100),
      (35.5, 55.4, 101, 150),
      (55.5, 150.4, 151, 200),
      (150.5, 250.4, 201, 300),
      (250.5, 350.4, 301, 400),
      (350.5, 500.4, 401, 500),
  ]

  for low, high, aqi_low, aqi_high in breakpoints:
    if pm25 <= high:
      aqi = ((aqi_high - aqi_low) / (high - low)) * (pm25 - low) + aqi_low
      return round(aqi)

  return 500


def generate_active_warnings(df_today):
  """Evaluates maximum hourly values for today against safety thresholds."""
  warnings = []

  max_temp = df_today["temperature"].max()
  min_temp = df_today["temperature"].min()
  max_wind = df_today["wind_speed"].max()
  max_humidity = df_today["humidity"].max()
  max_pm25 = df_today["pm2_5"].max()

  if pd.isna(max_pm25):
    max_pm25 = 0

  max_aqi = calculate_pm25_aqi(max_pm25)

  # Temperature Rules
  if max_temp >= 35.0:
    warnings.append({
        "id": "temp_high",
        "type": "Extreme Heat",
        "severity": "high",
        "metric": f"{max_temp}°C",
        "message": "High temperature threshold exceeded.",
        "precaution": (
            "Stay hydrated, limit outdoor activities during peak afternoon hours,"
            " and wear lightweight, breathable clothing."
        ),
    })
  elif min_temp <= 5.0:
    warnings.append({
        "id": "temp_low",
        "type": "Extreme Cold",
        "severity": "medium",
        "metric": f"{min_temp}°C",
        "message": "Freezing or low temperature detected.",
        "precaution": (
            "Dress in heavy thermal layers, wear gloves and insulated footwear,"
            " and limit skin exposure."
        ),
    })

  # Wind Speed Rule
  if max_wind > 20.0:
    warnings.append({
        "id": "wind_high",
        "type": "High Wind Advisory",
        "severity": "medium",
        "metric": f"{max_wind} km/h",
        "message": "Strong gusts recorded today.",
        "precaution": (
            "Hold onto loose outdoor items, carry an umbrella carefully, and drive"
            " cautiously on open expressways."
        ),
    })

  # Air Quality Rule
  if max_aqi > 100:
    warnings.append({
        "id": "aqi_high",
        "type": "High Air Quality Index",
        "severity": "high",
        "metric": f"AQI {max_aqi}",
        "message": (
            f"AQI reached {max_aqi} from a PM2.5 level of {max_pm25} µg/m³."
        ),
        "precaution": (
            "Wear a fitted N95 mask if heading outdoors, avoid outdoor"
            " jogging, and run an indoor air purifier."
        ),
    })

  # Humidity Rule
  if max_humidity > 80.0:
    warnings.append({
        "id": "humidity_high",
        "type": "High Humidity & Dampness",
        "severity": "low",
        "metric": f"{max_humidity}%",
        "message": "Heavy air moisture levels recorded.",
        "precaution": (
            "Carry an umbrella in case of sudden showers and stay in well-ventilated or air-conditioned environments."
        ),
    })

  return warnings

def generate_daily_summary(df):
    """
    Generates daily weather and air-quality summaries
    from the processed hourly dataframe.
    """

    if df is None or df.empty:
        return []

    working_df = df.copy()

    working_df["date"] = pd.to_datetime(working_df["time"]).dt.strftime("%Y-%m-%d")

    daily_summary = (
        working_df
        .groupby("date")
        .agg(
            avg_temperature=("temperature", "mean"),
            max_temperature=("temperature", "max"),
            min_temperature=("temperature", "min"),
            avg_humidity=("humidity", "mean"),
            avg_pressure=("pressure", "mean"),
            max_wind_speed=("wind_speed", "max"),
            avg_pm2_5=("pm2_5", "mean"),
            avg_pm10=("pm10", "mean"),
            avg_no2=("no2", "mean"),
            avg_co=("co", "mean"),
            avg_rain_probability=("rain_probability", "mean"),
            total_precipitation=("precipitation", "sum"),
        )
        .reset_index()
    )

    numeric_columns = [
        "avg_temperature",
        "max_temperature",
        "min_temperature",
        "avg_humidity",
        "avg_pressure",
        "max_wind_speed",
        "avg_pm2_5",
        "avg_pm10",
        "avg_no2",
        "avg_co",
        "avg_rain_probability",
        "total_precipitation",
    ]

    for column in numeric_columns:
        daily_summary[column] = daily_summary[column].round(2)

    return daily_summary.to_dict(orient="records")
