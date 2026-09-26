
import os
import matplotlib.pyplot as plt

from backend.fetcher import fetch_climate_data, get_coordinates
from backend.processor import generate_daily_summary, process_raw_data
from backend.visualizer import create_climate_dashboard


def compare_two_cities(city1, city2):
    """Fetches data for two cities and renders a side-by-side temperature comparison graph."""
    cities = [city1, city2]
    city_dfs = {}

    for city in cities:
        print(f"Resolving coordinates and data for '{city}'...")
        lat, lon, full_name = get_coordinates(city)
        if not lat:
            print(f"❌ Failed to resolve location for {city}. Aborting comparison.")
            return

        raw_weather, raw_air, *_rest = fetch_climate_data(lat, lon)
        df = process_raw_data(raw_weather, raw_air)
        city_dfs[city] = df

    # Plot comparison on a single chart
    plt.figure(figsize=(12, 6))
    plt.plot(
        city_dfs[city1]['time'],
        city_dfs[city1]['temperature'],
        label=f'{city1} Temp (°C)',
        color='crimson',
        linewidth=1.5
    )
    plt.plot(
        city_dfs[city2]['time'],
        city_dfs[city2]['temperature'],
        label=f'{city2} Temp (°C)',
        color='royalblue',
        linewidth=1.5
    )

    plt.title(
        f'Temperature Comparison: {city1} vs {city2}',
        fontsize=14,
        fontweight='bold',
    )
    plt.xlabel('Date')
    plt.ylabel('Temperature (°C)')
    plt.legend()
    plt.grid(True, linestyle='--', alpha=0.6)
    plt.tight_layout()
    plt.show()


def run_pipeline():
    """Runs the full data extraction, transformation, summary, and visualization pipeline for one city."""
    # Ensure target directory structure exists
    os.makedirs("data", exist_ok=True)
    os.makedirs("outputs", exist_ok=True)

    city = input("\nEnter target city name (e.g., London, Tokyo, Delhi): ").strip()
    if not city:
        print("❌ City name cannot be empty.")
        return

    print(f"\n1. Resolving coordinates for '{city}'...")
    lat, lon, display_name = get_coordinates(city)

    if not lat:
        print(f"❌ Could not locate '{city}'. Exiting pipeline.")
        return

    print(f"   Found: {display_name} ({lat}, {lon})")

    print("\n2. Requesting raw climate and pollution payloads...")
    raw_weather, raw_air, *_rest = fetch_climate_data(lat, lon)

    print("\n3. Transforming & cleaning data with Pandas...")
    df_hourly = process_raw_data(raw_weather, raw_air)
    df_summary = generate_daily_summary(df_hourly)

    # Calculate High-Wind Alerts safely AFTER df_hourly is processed
    if 'high_wind_alert' in df_hourly.columns:
        total_windy_hours = df_hourly['high_wind_alert'].sum()
        print(
            f"⚠️ High-Wind Alert (>20 km/h): Detected for {total_windy_hours} hours"
            " in the forecast period."
        )

    # Save local CSV backup for offline data auditing
    raw_csv_path = f"data/{city.lower().replace(' ', '_')}_hourly_climate.csv"
    df_hourly.to_csv(raw_csv_path, index=False)
    print(f"   Raw dataset archived to: {raw_csv_path}")

    print("\n--- 14-Day Daily Summary ---")
    print(df_summary.head(10).round(2))

    print("\n4. Rendering Matplotlib & Seaborn analytics dashboard...")
    chart_output_path = f"outputs/{city.lower().replace(' ', '_')}_analysis_dashboard.png"
    create_climate_dashboard(
        df_hourly, display_name, save_path=chart_output_path
    )
    print(f"✅ Dashboard generated successfully: {chart_output_path}")


if __name__ == "__main__":
    print("==========================================")
    print("       CLIMATE ANALYTICS PIPELINE        ")
    print("==========================================")
    print("1. Run Single City Analysis")
    print("2. Compare Two Cities")
    
    choice = input("\nSelect mode (1 or 2): ").strip()

    if choice == '1':
        run_pipeline()
    elif choice == '2':
        city_a = input("Enter first city: ").strip()
        city_b = input("Enter second city: ").strip()
        compare_two_cities(city_a, city_b)
    else:
        print("Invalid choice. Running default single city pipeline...")
        run_pipeline()
