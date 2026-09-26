# visualizer.py
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import seaborn as sns


def create_climate_dashboard(df, city_name, save_path="outputs/dashboard.png"):
  """Generates a multi-panel analytical dashboard image."""
  plt.style.use(
      "seaborn-v0_8-whitegrid"
      if "seaborn-v0_8-whitegrid" in plt.style.available
      else "default"
  )
  fig, axes = plt.subplots(3, 1, figsize=(14, 12), sharex=False)

  # --- PANEL 1: Temperature Curve & Moving Average ---
  axes[0].plot(
      df["time"],
      df["temperature"],
      color="lightcoral",
      alpha=0.5,
      label="Hourly Temp (°C)",
  )
  axes[0].plot(
      df["time"],
      df["temp_24h_ma"],
      color="firebrick",
      linewidth=2.5,
      label="24-Hour Trend (MA)",
  )
  axes[0].set_title(
      f"Temperature Dynamics — {city_name}", fontsize=12, fontweight="bold"
  )
  axes[0].set_ylabel("Temperature (°C)")
  axes[0].legend(loc="upper right")
  axes[0].grid(True, linestyle="--", alpha=0.5)

  # --- PANEL 2: PM2.5 Air Pollution & Safety Threshold ---
  axes[1].plot(
      df["time"],
      df["pm2_5"],
      color="skyblue",
      alpha=0.5,
      label="PM2.5 (µg/m³)",
  )
  axes[1].plot(
      df["time"],
      df["pm2_5_24h_ma"],
      color="navy",
      linewidth=2.5,
      label="24-Hour PM2.5 Trend",
  )
  axes[1].axhline(
      y=60,
      color="red",
      linestyle="--",
      linewidth=1.5,
      label="Safety Limit (60 µg/m³)",
  )
  axes[1].set_title("Particulate Matter (PM2.5) Air Quality Trend", fontsize=12, fontweight="bold")
  axes[1].set_ylabel("PM2.5 Concentration")
  axes[1].legend(loc="upper right")
  axes[1].grid(True, linestyle="--", alpha=0.5)

  # Format X-axis for panels 1 & 2
  axes[0].xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
  axes[1].xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))

  # --- PANEL 3: Metric Correlation Heatmap (Seaborn) ---
  corr_matrix = df[[
      "temperature",
      "humidity",
      "pressure",
      "wind_speed",
      "pm2_5",
      "pm10",
  ]].corr()
  sns.heatmap(
      corr_matrix,
      annot=True,
      cmap="coolwarm",
      fmt=".2f",
      ax=axes[2],
      cbar=True,
  )
  axes[2].set_title(
      "Parameter Cross-Correlation Matrix", fontsize=12, fontweight="bold"
  )

  plt.tight_layout()
  plt.savefig(save_path, dpi=300)
  print(f"[Success] Visual dashboard saved to: {save_path}")
  plt.show()