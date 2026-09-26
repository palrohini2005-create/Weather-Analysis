

"""Climate Analytics API (FastAPI).

Run from the ``backend/`` directory on Render::

    uvicorn api:app --host 0.0.0.0 --port $PORT

Works with zero mandatory environment variables: weather data comes
from Visual Crossing when VISUAL_CROSSING_API_KEY is set, otherwise
from the free Open-Meteo API.
"""

import math
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

try:  # Running as ``uvicorn api:app`` with rootDir=backend
    from fetcher import ClimateFetchError, fetch_climate_data, get_coordinates
    from processor import (
        generate_active_warnings,
        get_date_hourly_data,
        process_raw_data,
    )
except ImportError:  # Running as ``uvicorn backend.api:app`` / tests
    from backend.fetcher import (  # type: ignore[no-redef]
        ClimateFetchError,
        fetch_climate_data,
        get_coordinates,
    )
    from backend.processor import (  # type: ignore[no-redef]
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


def _safe_round(value, digits=2):
    """Round numbers but return None for NaN/None (JSON-safe)."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return round(number, digits)


def _serialise_records(df: pd.DataFrame):
    """Convert a processed dataframe to JSON-safe records."""
    if df is None or df.empty:
        return []

    working = df.copy()
    # 'date_str' is a temporary helper column added by get_date_hourly_data;
    # never expose it to API consumers.
    if "date_str" in working.columns:
        working = working.drop(columns=["date_str"])
    working["time"] = pd.to_datetime(
        working["time"], utc=False, errors="coerce"
    ).dt.strftime("%Y-%m-%dT%H:%M:%S")

    if "date" in working.columns:
        working["date"] = pd.to_datetime(
            working["date"], errors="coerce"
        ).dt.strftime("%Y-%m-%d")

    if "high_wind_alert" in working.columns:
        working["high_wind_alert"] = (
            working["high_wind_alert"].fillna(False).astype(bool)
        )

    records = working.to_dict(orient="records")

    # NaN / NaT / pandas NA are not valid JSON -> normalise to None.
    for record in records:
        for key, value in list(record.items()):
            if value is None:
                continue
            if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
                record[key] = None
            elif pd.isna(value):
                record[key] = None

    return records


@app.get("/")
def read_root():
    return {"status": "online", "message": "Climate Data API is running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/climate/{city}")
def get_climate_analysis(city: str, selected_date: Optional[str] = None):
    if not city or not city.strip():
        raise HTTPException(status_code=400, detail="City name is required.")

    lat, lon, full_name = get_coordinates(city)
    if lat is None or lon is None:
        raise HTTPException(
            status_code=404,
            detail=f"City '{city.strip()}' not found. Try another spelling.",
        )

    try:
        raw_weather, raw_air = fetch_climate_data(lat, lon)
    except ClimateFetchError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except Exception as error:  # never leak a raw 500 for provider issues
        raise HTTPException(
            status_code=502,
            detail=f"Weather data is currently unavailable: {error}",
        ) from error

    if not raw_weather or not raw_air:
        raise HTTPException(
            status_code=502,
            detail="Weather data is currently unavailable. Please retry shortly.",
        )

    try:
        df = process_raw_data(raw_weather, raw_air)
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to process weather data: {error}",
        ) from error

    if df is None or df.empty:
        raise HTTPException(
            status_code=502,
            detail=(
                "No overlapping weather and air-quality hours were returned "
                "by the providers. Please retry shortly."
            ),
        )

    df_selected = get_date_hourly_data(df, target_date_str=selected_date)

    if df_selected is None or df_selected.empty:
        raise HTTPException(
            status_code=502,
            detail="No hourly data available for the requested date.",
        )

    try:
        active_warnings = generate_active_warnings(df_selected)
    except Exception:
        active_warnings = []

    # Sorted so the Telemetry "View date" dropdown lists the full
    # ~30-day archive + 7-day forecast in chronological order.
    available_dates = sorted(
        pd.to_datetime(df["time"], errors="coerce")
        .dt.strftime("%Y-%m-%d")
        .dropna()
        .unique()
        .tolist()
    )

    resolved_date = pd.to_datetime(
        df_selected["time"].iloc[0], errors="coerce"
    )
    resolved_date_str = (
        resolved_date.strftime("%Y-%m-%d")
        if not pd.isna(resolved_date)
        else (selected_date or "")
    )

    return {
        "location": full_name,
        "selected_date": resolved_date_str,
        "available_dates": available_dates,
        "summary": {
            "avg_temp": _safe_round(df_selected["temperature"].mean()),
            "max_temp": _safe_round(df_selected["temperature"].max()),
            "avg_pm25": _safe_round(df_selected["pm2_5"].mean()),
        },
        "active_warnings": active_warnings,
        "today_hourly_data": _serialise_records(df_selected),
        "hourly_data": _serialise_records(df),
    }
