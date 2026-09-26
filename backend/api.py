

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
        climate_result = fetch_climate_data(lat, lon)
        # Backward-compat: fetcher returns (weather, air) or (weather, air, daily).
        if len(climate_result) == 3:
            raw_weather, raw_air, daily_history = climate_result
        else:
            raw_weather, raw_air = climate_result
            daily_history = []
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

    _req = (selected_date or "").strip()
    if _req and available_dates and _req not in available_dates:
        # Old 30-day bookmark/link -> snap to today within 3-day window.
        _req = ""
    df_selected = get_date_hourly_data(df, target_date_str=_req or None)

    if df_selected is None or df_selected.empty:
        raise HTTPException(
            status_code=502,
            detail="No hourly data available for the requested date.",
        )

    try:
        active_warnings = generate_active_warnings(df_selected)
    except Exception:
        active_warnings = []

    # Telemetry dropdown: ONLY yesterday + today + tomorrow (3 days).
    # Charts use hourly_data (7-day) + daily_history (3-month) instead.
    from datetime import date as _date, timedelta as _td
    _today = _date.today()
    _wanted = sorted([(_today + _td(days=d)).isoformat() for d in (-1, 0, 1)])
    _have = set(
        pd.to_datetime(df["time"], errors="coerce")
        .dt.strftime("%Y-%m-%d")
        .dropna()
        .unique()
        .tolist()
    )
    available_dates = [d for d in _wanted if d in _have]
    if not available_dates:
        # Fallback: closest 3 dates to today (provider edge cases).
        _all = sorted(_have)
        available_dates = _all[-3:] if len(_all) >= 3 else _all

    resolved_date = pd.to_datetime(
        df_selected["time"].iloc[0], errors="coerce"
    )
    resolved_date_str = (
        resolved_date.strftime("%Y-%m-%d")
        if not pd.isna(resolved_date)
        else (selected_date or "")
    )

    # Sanitize daily_history to JSON-safe primitives.
    _daily_clean = []
    for _d in (daily_history or []):
        try:
            _daily_clean.append({
                "date": str(_d.get("date")),
                "avg_temp": _safe_round(_d.get("avg_temp")),
                "max_temp": _safe_round(_d.get("max_temp")),
                "min_temp": _safe_round(_d.get("min_temp")),
                "precipitation": _safe_round(_d.get("precipitation")),
                "rain_probability": _safe_round(_d.get("rain_probability")),
            })
        except Exception:
            continue

    return {
        "location": full_name,
        "selected_date": resolved_date_str,
        "available_dates": available_dates,
        "daily_history": _daily_clean,
        "summary": {
            "avg_temp": _safe_round(df_selected["temperature"].mean()),
            "max_temp": _safe_round(df_selected["temperature"].max()),
            "avg_pm25": _safe_round(df_selected["pm2_5"].mean()),
        },
        "active_warnings": active_warnings,
        "today_hourly_data": _serialise_records(df_selected),
        "hourly_data": _serialise_records(df),
    }
