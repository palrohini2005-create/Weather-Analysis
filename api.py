from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from fetcher import ClimateFetchError, fetch_climate_data, get_coordinates
from processor import (
    generate_active_warnings,
    get_date_hourly_data,
    process_raw_data,
)

app = FastAPI(title="Climate Analytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"status": "online", "message": "Climate Data API is running"}


@app.get("/api/climate/{city}")
def get_climate_analysis(city: str, selected_date: Optional[str] = None):
    lat, lon, full_name = get_coordinates(city)
    if not lat:
        raise HTTPException(status_code=404, detail="City not found")

    try:
        raw_weather, raw_air = fetch_climate_data(lat, lon)
    except ClimateFetchError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    if not raw_weather or not raw_air:
        raise HTTPException(
            status_code=502,
            detail="Open-Meteo weather or air-quality data is currently unavailable.",
        )

    df = process_raw_data(raw_weather, raw_air)
    df_selected = get_date_hourly_data(df, target_date_str=selected_date)
    active_warnings = generate_active_warnings(df_selected)
    available_dates = (
        pd.to_datetime(df["time"]).dt.strftime("%Y-%m-%d").unique().tolist()
    )

    return {
        "location": full_name,
        "selected_date": (
            selected_date or df_selected["time"].iloc[0].strftime("%Y-%m-%d")
        ),
        "available_dates": available_dates,
        "summary": {
            "avg_temp": round(df_selected["temperature"].mean(), 2),
            "max_temp": round(df_selected["temperature"].max(), 2),
            "avg_pm25": round(df_selected["pm2_5"].mean(), 2),
        },
        "active_warnings": active_warnings,
        "today_hourly_data": df_selected.to_dict(orient="records"),
        "hourly_data": df.to_dict(orient="records"),
    }
