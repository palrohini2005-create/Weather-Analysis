import plotly.express as px
import streamlit as st
from fetcher import fetch_climate_data, get_coordinates
from processor import process_raw_data

st.set_page_config(
    page_title='Climate & Air Quality Analyzer',
    page_icon='🌡️',
    layout='wide',
)
st.title('🌡️ Real-Time Climate & Air Trends Dashboard')

city = st.sidebar.text_input('Enter City Name', value='London')

if st.sidebar.button('Analyze Climate Data'):
  with st.spinner('Fetching coordinates and processing API data...'):
    lat, lon, full_name = get_coordinates(city)

    if lat and lon:
      raw_weather, raw_air = fetch_climate_data(lat, lon)
      df = process_raw_data(raw_weather, raw_air)

      # Top Metrics Cards
      col1, col2, col3 = st.columns(3)
      col1.metric('Avg Temperature', f"{df['temperature'].mean():.1f} °C")
      col2.metric('Peak Wind Speed', f"{df['wind_speed'].max():.1f} km/h")
      col3.metric('Avg PM2.5 Level', f"{df['pm2_5'].mean():.1f} µg/m³")

      # Interactive Plotly Chart
      st.subheader('Interactive Temperature & Rolling Trend')
      fig = px.line(
          df,
          x='time',
          y=['temperature', 'temp_24h_ma'],
          labels={'value': 'Temperature (°C)', 'variable': 'Metric'},
          title=f'Temperature Analytics for {full_name}',
      )
      st.plotly_chart(fig, use_container_width=True)

      # Raw Data Drawer
      with st.expander('View Processed Dataset'):
        st.dataframe(df)
    else:
      st.error('City not found. Please try again.')