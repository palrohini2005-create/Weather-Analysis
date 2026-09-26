
import { useEffect, useState } from 'react';
import {
  Menu,
  X,
  LayoutDashboard,
  AlertTriangle,
  Table,
  HelpCircle,
  Search,
  Thermometer,
  Wind,
  Activity,
  RefreshCw,
  ShieldAlert,
  Info,
  CheckCircle2,
  ChevronRight,
  BarChart2,
  ArrowRight,
  Database,
  CloudSun,
  Clock3,
  ShieldCheck,
  TrendingUp,
  MapPin,
  Home,
  Droplets,
  Cloud,
  Sun,
  Smile,
  Frown
} from 'lucide-react';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'https://climate-analysis-api.onrender.com'
).replace(/\/+$/, '');

export default function WeatherApp() {

  // =========================================================
  // APPLICATION STATES
  // =========================================================

  // Landing page / application page
  const [showLanding, setShowLanding] = useState(true);

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Desktop sidebar collapse
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Main navigation
  const [activeTab, setActiveTab] = useState('dashboard');

  // Analytics visualization tab
  const [activeVizTab, setActiveVizTab] = useState('temp');
  const [chartRange, setChartRange] = useState('daily');

  // Search/API states
  const [cityInput, setCityInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [telemetryRows, setTelemetryRows] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [alertsViewed, setAlertsViewed] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [searchedCity, setSearchedCity] = useState('');

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTimestamp(Date.now());

    updateCurrentTime();
    const intervalId = window.setInterval(updateCurrentTime, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);


  // =========================================================
  // FETCH WEATHER DATA
  // =========================================================

  const fetchClimateData = async (
    city,
    requestedDate = '',
    returnToDashboard = true
  ) => {
    if (!city.trim()) return;

    setLoading(true);
    setError('');

    try {
      const dateQuery = requestedDate
        ? `?selected_date=${encodeURIComponent(requestedDate)}`
        : '';
      const response = await fetch(
        `${API_BASE_URL}/api/climate/${encodeURIComponent(city)}${dateQuery}`
      );

      if (!response.ok) {
        let detail = '';
        try {
          detail = (await response.json()).detail || '';
        } catch {
          // Response was not JSON - fall through to generic messages.
        }
        if (response.status === 404) {
          throw new Error(detail || `City "${city.trim()}" not found. Try another spelling.`);
        }
        throw new Error(detail || 'Weather service is temporarily unavailable. Please retry in a minute.');
      }

      const result = await response.json();
      setData(result);
      setTelemetryRows(result.today_hourly_data || []);
      setSelectedDate(result.selected_date || requestedDate);
      setSearchedCity(city.trim());
      setAlertsViewed(false);

      // Automatically move to dashboard after successful search
      if (returnToDashboard) {
        setActiveTab('dashboard');
      }

      // Close sidebar on mobile
      setSidebarOpen(false);

    } catch (err) {
      setError(err.message || 'Failed to fetch weather data');
      setData(null);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (!searchedCity) return undefined;

    const refreshCurrentWeather = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/climate/${encodeURIComponent(searchedCity)}`
        );

        if (!response.ok) return;

        const result = await response.json();
        setData(result);

        // Keep historical telemetry selection intact; refresh today's rows otherwise.
        if (!selectedDate || selectedDate === result.selected_date) {
          setTelemetryRows(result.today_hourly_data || []);
          setSelectedDate(result.selected_date || '');
        }
      } catch {
        // Preserve the last successful weather snapshot during a refresh failure.
      }
    };

    const intervalId = window.setInterval(
      refreshCurrentWeather,
      10 * 60 * 1000
    );

    return () => window.clearInterval(intervalId);
  }, [searchedCity]);


  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchClimateData(cityInput);
  };


  const clearSearch = () => {
    setCityInput('');
    setData(null);
    setTelemetryRows([]);
    setSelectedDate('');
    setSearchedCity('');
    setError('');
    setActiveTab('dashboard');
  };


  const fetchTelemetryForDate = async (requestedDate) => {
  const locationToUse = searchedCity.trim();

  if (!locationToUse) return;

  setLoading(true);
  setError('');

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/climate/${encodeURIComponent(locationToUse)}?selected_date=${encodeURIComponent(requestedDate)}`
    );

    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.json()).detail || '';
      } catch {
        // Response was not JSON - fall through to the generic message.
      }
      throw new Error(detail || 'Unable to load telemetry for this date');
    }

    const result = await response.json();

    setTelemetryRows(result.today_hourly_data || []);
    setSelectedDate(result.selected_date || requestedDate);

    setData(prev => ({
      ...prev,
      ...result
    }));

  } catch (err) {
    setError(err.message || 'Failed to fetch telemetry data');
  } finally {
    setLoading(false);
  }
};

  const handleDateChange = (e) => {
    const nextDate = e.target.value;
    setSelectedDate(nextDate);
    fetchTelemetryForDate(nextDate);
  };


  // =========================================================
  // LANDING PAGE
  // =========================================================

  const enterApplication = () => {
    setShowLanding(false);
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };


  const returnToLanding = () => {
    setShowLanding(true);
    setSidebarOpen(false);
    setSidebarCollapsed(false);

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };


  // =========================================================
  // PIE CHART DATA
  // =========================================================

  const getChartPeriodData = () => {
    if (!data?.hourly_data?.length) return [];

    const grouped = data.hourly_data.reduce((groups, row) => {
      const date = String(row.time).slice(0, 10);
      const period = chartRange === 'monthly'
        ? date.slice(0, 7)
        : date;

      if (!groups[period]) {
        groups[period] = {
          temperature: [],
          movingAverage: [],
          pm25: [],
          pm10: [],
          no2: [],
          co: [],
          rainProbability: [],
          precipitation: []
        };
      }

      groups[period].temperature.push(row.temperature || 0);
      groups[period].movingAverage.push(row.temp_24h_ma || 0);
      groups[period].pm25.push(row.pm2_5 || 0);
      groups[period].pm10.push(row.pm10 || 0);
      groups[period].no2.push(row.no2 || 0);
      groups[period].co.push(row.co || 0);
      groups[period].rainProbability.push(row.rain_probability || 0);
      groups[period].precipitation.push(row.precipitation || 0);
      return groups;
    }, {});

    const sortedPeriods = Object.entries(grouped)
      .sort(([firstPeriod], [secondPeriod]) =>
        firstPeriod.localeCompare(secondPeriod)
      )
      .map(([period, values]) => {
        const average = (items) =>
          items.reduce((sum, value) => sum + value, 0) / items.length;

        return {
          period,
          averageTemperature: Number(average(values.temperature).toFixed(2)),
          averageMovingAverage: Number(average(values.movingAverage).toFixed(2)),
          pm2_5: Number(average(values.pm25).toFixed(2)),
          pm10: Number(average(values.pm10).toFixed(2)),
          no2: Number(average(values.no2).toFixed(2)),
          co: Number(average(values.co).toFixed(2)),
          rain_probability: Number(
            average(values.rainProbability).toFixed(2)
          ),
          precipitation: Number(
            values.precipitation.reduce((sum, value) => sum + value, 0).toFixed(2)
          )
        };
      });

    // Telemetry table keeps the full 30-day archive.
    // Charts only show a recent window so they stay readable:
    // Daily -> last 7 days, Monthly -> last 12 months
    // (falls back to last 2 months when only ~30-37 days exist).
    const chartWindow = chartRange === 'monthly' ? 12 : 7;
    return sortedPeriods.slice(-chartWindow);
  };

  const getPieChartData = () => {
    const chartData = getChartPeriodData();
    if (!chartData.length) return [];

    const average = (key) =>
      chartData.reduce((sum, row) => sum + row[key], 0) / chartData.length;

    return [
      {
        name: 'PM2.5 (µg/m³)',
        value: Number(average('pm2_5').toFixed(2)),
        color: '#2563eb'
      },
      {
        name: 'PM10 (µg/m³)',
        value: Number(average('pm10').toFixed(2)),
        color: '#0ea5e9'
      },
      {
        name: 'NO2 (µg/m³)',
        value: Number(average('no2').toFixed(2)),
        color: '#14b8a6'
      },
      {
        name: 'CO (µg/m³)',
        value: Number(average('co').toFixed(2)),
        color: '#f59e0b'
      }
    ];
  };

  const getCurrentTelemetry = () => {
    const rows = data?.today_hourly_data?.length > 0
      ? data.today_hourly_data
      : data?.hourly_data;

    if (!rows?.length) return null;
    if (!currentTimestamp) return rows[0];

    return rows.reduce((closest, row) => {
      const rowDistance = Math.abs(
        new Date(row.time).getTime() - currentTimestamp
      );
      const closestDistance = Math.abs(
        new Date(closest.time).getTime() - currentTimestamp
      );

      return rowDistance < closestDistance ? row : closest;
    });
  };

  const getAqiFromValue = (value, breakpoints) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '--';

    const range = breakpoints.find(
      ([low]) => value >= low
    ) || breakpoints[breakpoints.length - 1];
    const [low, high, aqiLow, aqiHigh] = range;

    return Math.round(
      ((aqiHigh - aqiLow) / (high - low)) * (value - low) + aqiLow
    );
  };

  const getAqiFromPm25 = (pm25) => getAqiFromValue(pm25, [
    [0, 12, 0, 50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200],
    [150.5, 250.4, 201, 300],
    [250.5, 350.4, 301, 400],
    [350.5, 500.4, 401, 500]
  ]);

  const getAqiColor = (aqi) => {
    if (aqi <= 50) return '#16a34a';
    if (aqi <= 100) return '#eab308';
    if (aqi <= 200) return '#f97316';
    return '#dc2626';
  };

  const getAirQualityIndexData = () =>
    getChartPeriodData().map((row) => ({
      ...row,
      pm25_aqi: getAqiFromValue(row.pm2_5, [
        [0, 12, 0, 50],
        [12.1, 35.4, 51, 100],
        [35.5, 55.4, 101, 150],
        [55.5, 150.4, 151, 200],
        [150.5, 250.4, 201, 300],
        [250.5, 350.4, 301, 400],
        [350.5, 500.4, 401, 500]
      ]),
      pm10_aqi: getAqiFromValue(row.pm10, [
        [0, 54, 0, 50],
        [55, 154, 51, 100],
        [155, 254, 101, 150],
        [255, 354, 151, 200],
        [355, 424, 201, 300],
        [425, 504, 301, 400],
        [505, 604, 401, 500]
      ]),
      no2_aqi: getAqiFromValue(row.no2 * 24.45 / 46.0055, [
        [0, 53, 0, 50],
        [54, 100, 51, 100],
        [101, 360, 101, 150],
        [361, 649, 151, 200],
        [650, 1249, 201, 300],
        [1250, 1649, 301, 400],
        [1650, 2049, 401, 500]
      ])
    })).map((row) => ({
      ...row,
      overall_aqi: Math.max(row.pm25_aqi, row.pm10_aqi, row.no2_aqi)
    }));

  const currentTelemetry = getCurrentTelemetry();
  const currentAqi = getAqiFromPm25(currentTelemetry?.pm2_5);
  const temperatureValue = Number(currentTelemetry?.temperature);
  const rainProbability = Number(currentTelemetry?.rain_probability);
  const humidityValue = Number(currentTelemetry?.humidity);
  const windValue = Number(currentTelemetry?.wind_speed);

  const temperatureState = temperatureValue >= 34
    ? 'hot'
    : temperatureValue > 30
      ? 'warm'
      : 'comfortable';
  const rainState = rainProbability > 50 ? 'cloudy' : 'sunny';
  const aqiState = currentAqi !== '--' && currentAqi > 100
    ? 'unhealthy'
    : currentAqi !== '--' && currentAqi > 50
      ? 'moderate'
      : 'good';
  const humidityState = humidityValue > 80
    ? 'humid'
    : humidityValue < 30
      ? 'dry'
      : 'comfortable';
  const windState = windValue > 20 ? 'high' : 'normal';


  // =========================================================
  // TABLE ROW
  // =========================================================

  const renderTableRow = (row, idx) => (
    <tr
      key={idx}
      className="border-b border-slate-200 hover:bg-blue-50 transition"
    >
      <td className="px-5 py-3 text-xs text-slate-600 whitespace-nowrap">
        {new Date(row.time).toLocaleString([], {
          dateStyle: 'short',
          timeStyle: 'short'
        })}
      </td>

      <td className="px-5 py-3 font-semibold text-blue-700">
        {row.temperature} °C
      </td>

      <td className="px-5 py-3 text-slate-700">
        {row.humidity} %
      </td>

      <td className="px-5 py-3 text-slate-700">
        {row.pressure} hPa
      </td>

      <td className="px-5 py-3">
        <span
          className={`inline-flex items-center gap-1 ${
            row.high_wind_alert
              ? 'text-amber-600 font-semibold'
              : 'text-slate-700'
          }`}
        >
          {row.wind_speed} km/h

          {row.high_wind_alert && (
            <Wind className="w-3.5 h-3.5 text-amber-600" />
          )}
        </span>
      </td>

      <td className="px-5 py-3 text-blue-700 font-medium">
        {row.rain_probability}%
      </td>

    </tr>
  );


  // =========================================================
  // NAVIGATION
  // =========================================================

  const navigateTo = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);

    if (tab === 'warnings') {
      setAlertsViewed(true);
    }
  };


  // =========================================================
  // LANDING PAGE
  // =========================================================

  if (showLanding) {
    return (
      <div className="min-h-screen bg-white text-slate-800">

        {/* =================================================
            LANDING HEADER
        ================================================= */}

        <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200">

          <div className="max-w-7xl mx-auto px-5 sm:px-8">

            <div className="h-16 flex items-center justify-between">

              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="flex items-center gap-3"
              >

                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-200">
                  <CloudSun className="w-5 h-5 text-white" />
                </div>

                <div className="text-left">
                  <div className="text-base font-bold text-slate-900">
                    ClimateHub
                  </div>

                  <div className="text-[10px] uppercase tracking-widest text-blue-600 font-semibold">
                    Weather Analysis
                  </div>
                </div>

              </button>


              <button
                onClick={enterApplication}
                className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition shadow-sm"
              >
                Open Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>

            </div>

          </div>

        </header>


        {/* =================================================
            HERO SECTION
        ================================================= */}

        <section className="relative overflow-hidden">

          {/* Background decoration */}
          <div className="absolute inset-0 pointer-events-none">

            <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-blue-100 blur-3xl opacity-60" />

            <div className="absolute top-60 -left-40 w-96 h-96 rounded-full bg-sky-100 blur-3xl opacity-60" />

          </div>


          <div className="relative max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28 lg:py-32">

            <div className="grid lg:grid-cols-2 gap-14 items-center">

              {/* LEFT */}
              <div>

                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-6">

                  <span className="w-2 h-2 rounded-full bg-blue-600" />
                  Weather & Climate Analytics

                </div>


  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-100 leading-[1.08]">
  Decode the Atmosphere.
  <span className="block text-blue-500 mt-2">
    Command Your Day.
  </span>
</h1>


                <p className="mt-6 text-base sm:text-lg text-slate-600 leading-8 max-w-xl">

                  Analyze climate trends, monitor real-time pollutants, and receive instant threshold alerts to stay ahead of the weather.

                </p>


                <div className="flex flex-col sm:flex-row gap-3 mt-8">

                  <button
                    onClick={enterApplication}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition shadow-lg shadow-blue-200"
                  >
                    Start Analysis
                    <ArrowRight className="w-5 h-5" />
                  </button>


                  <a
                    href="#features"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white border border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-700 font-semibold transition"
                  >
                    Explore Features
                    <ChevronRight className="w-4 h-4" />
                  </a>

                </div>


                <div className="flex flex-wrap gap-6 mt-8 text-sm text-slate-500">

                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Historical Analysis
                  </div>

                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Forecast Data
                  </div>

                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Threshold Alerts
                  </div>

                </div>

              </div>


              {/* RIGHT - DASHBOARD PREVIEW */}
              <div className="relative">

                <div className="rounded-3xl bg-white border border-slate-200 shadow-2xl shadow-blue-100 p-4 sm:p-6">

                  <div className="flex items-center justify-between mb-5">

                    <div>
                      <div className="text-xs text-slate-500">
                        Weather Overview
                      </div>

                      <div className="text-lg font-bold text-slate-900 mt-1">
                        Climate Analytics
                      </div>
                    </div>

                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                    </div>

                  </div>


                  <div className="grid grid-cols-2 gap-3 mb-4">

                    <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">

                      <Thermometer className="w-5 h-5 text-blue-600 mb-3" />

                      <div className="text-xs text-slate-500">
                        Temperature
                      </div>

                      <div className="text-2xl font-bold text-slate-900 mt-1">
                        28.4°C
                      </div>

                    </div>


                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">

                      <Activity className="w-5 h-5 text-emerald-600 mb-3" />

                      <div className="text-xs text-slate-500">
                        PM2.5
                      </div>

                      <div className="text-2xl font-bold text-slate-900 mt-1">
                        34.2
                      </div>

                    </div>

                  </div>


                  <div className="rounded-2xl border border-slate-200 p-4">

                    <div className="flex justify-between items-center mb-5">

                      <span className="text-sm font-semibold text-slate-800">
                        Temperature Trend
                      </span>

                      <span className="text-xs text-blue-600 font-medium">
                        24 Hours
                      </span>

                    </div>


                    <div className="h-40">

                      <ResponsiveContainer width="100%" height="100%">

                        <LineChart
                          data={[
                            { x: '6AM', y: 22 },
                            { x: '9AM', y: 24 },
                            { x: '12PM', y: 29 },
                            { x: '3PM', y: 31 },
                            { x: '6PM', y: 28 },
                            { x: '9PM', y: 25 }
                          ]}
                        >

                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e2e8f0"
                          />

                          <XAxis
                            dataKey="x"
                            tick={{ fontSize: 10 }}
                            stroke="#94a3b8"
                          />

                          <YAxis
                            tick={{ fontSize: 10 }}
                            stroke="#94a3b8"
                          />

                          <Line
                            type="monotone"
                            dataKey="y"
                            stroke="#2563eb"
                            strokeWidth={3}
                            dot={false}
                          />

                        </LineChart>

                      </ResponsiveContainer>

                    </div>

                  </div>

                </div>


                {/* Floating status card */}
                <div className="absolute -bottom-5 -left-4 sm:-left-8 bg-white border border-slate-200 shadow-xl rounded-2xl p-4">

                  <div className="flex items-center gap-3">

                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">
                        System Status
                      </div>

                      <div className="text-sm font-bold text-slate-900">
                        Monitoring Active
                      </div>
                    </div>

                  </div>

                </div>

              </div>

            </div>

          </div>

        </section>


        {/* =================================================
            FEATURES
        ================================================= */}

        <section
          id="features"
          className="py-20 sm:py-24 bg-slate-50 border-y border-slate-200"
        >

          <div className="max-w-7xl mx-auto px-5 sm:px-8">

            <div className="text-center max-w-2xl mx-auto">

              <div className="text-sm font-semibold text-blue-600 mb-2">
                PLATFORM FEATURES
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold text-slate-100 leading-[1.08]">
                Everything You Need to Understand 
              </h2>

              <p className="mt-4 text-slate-600 leading-7">
                ClimateHub Pro transforms raw environmental data into
                clear visual insights, trends and actionable warnings.
              </p>

            </div>


            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">

              {/* Feature 1 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-50 transition">

                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mb-5">
                  <Database className="w-5 h-5 text-blue-600" />
                </div>

                <h3 className="text-lg font-bold text-slate-900">
                  30-Day Data Analysis
                </h3>

                <p className="text-sm text-slate-600 leading-6 mt-2">
                  Explore historical weather and environmental
                  data across a 30-day analysis period.
                </p>

              </div>


              {/* Feature 2 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-50 transition">

                <div className="w-11 h-11 rounded-xl bg-sky-50 flex items-center justify-center mb-5">
                  <TrendingUp className="w-5 h-5 text-sky-600" />
                </div>

                <h3 className="text-lg font-bold text-slate-900">
                  Temperature Analysis
                </h3>

                <p className="text-sm text-slate-600 leading-6 mt-2">
                  Track temperature trends using interactive graphs
                  and moving averages for easier interpretation.
                </p>

              </div>


              {/* Feature 3 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-50 transition">

                <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center mb-5">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>

                <h3 className="text-lg font-bold text-slate-900">
                  Smart Threshold Warnings
                </h3>

                <p className="text-sm text-slate-600 leading-6 mt-2">
                  Automatically identify conditions where configured
                  temperature, wind or air-quality thresholds are crossed.
                </p>

              </div>


              {/* Feature 4 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-50 transition">

                <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center mb-5">
                  <Activity className="w-5 h-5 text-emerald-600" />
                </div>

                <h3 className="text-lg font-bold text-slate-900">
                  Air Quality Monitoring
                </h3>

                <p className="text-sm text-slate-600 leading-6 mt-2">
                  Monitor PM2.5, PM10 and NO2 values through
                  readable summaries and visual comparisons.
                </p>

              </div>


              {/* Feature 5 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-50 transition">

                <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center mb-5">
                  <BarChart2 className="w-5 h-5 text-violet-600" />
                </div>

                <h3 className="text-lg font-bold text-slate-900">
                  Interactive Analytics
                </h3>

                <p className="text-sm text-slate-600 leading-6 mt-2">
                  Switch between line, bar and pie visualizations
                  to understand environmental patterns.
                </p>

              </div>


              {/* Feature 6 */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-50 transition">

                <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center mb-5">
                  <Clock3 className="w-5 h-5 text-indigo-600" />
                </div>

                <h3 className="text-lg font-bold text-slate-900">
                  Hourly Telemetry
                </h3>

                <p className="text-sm text-slate-600 leading-6 mt-2">
                  Inspect hourly temperature, humidity, wind and
                  air-quality measurements in a structured table.
                </p>

              </div>

            </div>

          </div>

        </section>


        {/* =================================================
            HOW IT WORKS
        ================================================= */}

        <section className="py-20 sm:py-24 bg-white">

          <div className="max-w-6xl mx-auto px-5 sm:px-8">

            <div className="text-center">

              <div className="text-sm font-semibold text-blue-600">
                HOW IT WORKS
              </div>

              <h2 className="text-3xl font-bold  text-slate-100 leading-[1.08]">
                Analyze a Location in Three Simple Steps
              </h2>

            </div>


            <div className="grid md:grid-cols-3 gap-8 mt-12">

              <div className="text-center">

                <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-blue-100">
                  01
                </div>

                <h3 className="font-bold text-lg text-slate-900 mt-5">
                  Search a location
                </h3>

                <p className="text-sm text-slate-600 leading-6 mt-2">
                  Enter a city or location you want to analyze.
                </p>

              </div>


              <div className="text-center">

                <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-blue-100">
                  02
                </div>

                <h3 className="font-bold text-lg text-slate-900 mt-5">
                  Process the data
                </h3>

                <p className="text-sm text-slate-600 leading-6 mt-2">
                  The application retrieves and processes weather
                  and environmental measurements.
                </p>

              </div>


              <div className="text-center">

                <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-blue-100">
                  03
                </div>

                <h3 className="font-bold text-lg text-slate-900 mt-5">
                  Explore insights
                </h3>

                <p className="text-sm text-slate-600 leading-6 mt-2">
                  View trends, warnings, charts and detailed telemetry.
                </p>

              </div>

            </div>

          </div>

        </section>


        {/* =================================================
            CTA
        ================================================= */}

        <section className="py-20 px-5">

          <div className="max-w-6xl mx-auto rounded-3xl bg-blue-600 px-7 sm:px-12 py-12 sm:py-16 text-center relative overflow-hidden">

            <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10" />

            <div className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full bg-white/10" />

            <div className="relative">

              <h2 className="text-3xl sm:text-4xl font-bold text-white">
                Ready to analyze the weather?
              </h2>

              <p className="text-blue-100 mt-4 max-w-xl mx-auto">
                Start exploring historical weather, air-quality
                metrics and threshold-based warnings.
              </p>

              <button
                onClick={enterApplication}
                className="mt-7 inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-bold transition shadow-lg"
              >
                Start Analysis
                <ArrowRight className="w-5 h-5" />
              </button>

            </div>

          </div>

        </section>


        {/* =================================================
            LANDING FOOTER
        ================================================= */}

        <footer className="border-t border-slate-200 bg-slate-50">

          <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8">

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

              <div className="flex items-center gap-3">

                

                <div>
                  <div className="font-bold text-slate-900">
                    ClimateHub 
                  </div>

                  <div className="text-xs text-slate-500">
                    Weather and Climate Anlysis Platform
                  </div>
                </div>

              </div>


              <div className="text-xs text-slate-500">
                Open-Meteo Integration • Weather & Climate Analytics
              </div>

            </div>

          </div>

        </footer>

      </div>
    );
  }


  // =========================================================
  // ACTUAL APPLICATION
  // =========================================================

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col">


      {/* =====================================================
          APPLICATION HEADER
      ===================================================== */}

      <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">

        <div className="h-full flex items-center justify-between px-4 sm:px-6">

          {/* LEFT SIDE */}
          <div className="flex items-center gap-3">

            {/* SIDEBAR TOGGLE */}

            <button
              onClick={() => {
                // Mobile
                if (window.innerWidth < 1024) {
                  setSidebarOpen(prev => !prev);
                } else {
                  // Desktop
                  setSidebarCollapsed(prev => !prev);
                }
              }}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition"
              aria-label="Toggle navigation"
            >
              {sidebarOpen || !sidebarCollapsed ? (
                <Menu className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>


            {/* LOGO */}

            <button
              onClick={returnToLanding}
              className="flex items-center gap-2.5"
            >

              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
                <CloudSun className="w-5 h-5 text-white" />
              </div>

              <div className="hidden sm:block text-left">

                <div className="font-bold text-slate-900 leading-none">
                  ClimateHub
                </div>

                <div className="text-[9px] text-blue-600 font-semibold uppercase tracking-wider mt-1">
                  Weather Analysis
                </div>

              </div>

            </button>

          </div>


          {/* CENTER SEARCH */}

          <form
            onSubmit={handleSearchSubmit}
            className="hidden md:flex items-center gap-2 w-full max-w-xl mx-8"
          >

            <div className="relative flex-1">

              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

              <input
                type="text"
                placeholder="Search city or location..."
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition"
              />

            </div>


            <button
              type="submit"
              disabled={loading || !cityInput.trim()}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >

              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Analyze
                  <ArrowRight className="w-4 h-4" />
                </>
              )}

            </button>

            <button
              type="button"
              onClick={clearSearch}
              disabled={!data && !cityInput && !error}
              className="w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="Clear search and return to the empty view"
              aria-label="Clear search and return to the empty view"
            >
              <RefreshCw className="w-4 h-4 mx-auto" />
            </button>

          </form>


          {/* RIGHT SIDE */}

          <div className="flex items-center gap-3">

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">

              <span className="w-2 h-2 rounded-full bg-emerald-500" />

              <span className="text-xs font-semibold text-emerald-700">
                System Active
              </span>

            </div>


            {/* BACK TO LANDING */}

            <button
              onClick={returnToLanding}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition"
              title="Back to landing page"
            >
              <Home className="w-5 h-5" />
            </button>

          </div>

        </div>

      </header>


      {/* =====================================================
          MOBILE SEARCH
      ===================================================== */}

      <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3">

        <form
          onSubmit={handleSearchSubmit}
          className="flex gap-2"
        >

          <div className="relative flex-1">

            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

            <input
              type="text"
              placeholder="Search location..."
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

          </div>

          <button
            type="submit"
            disabled={loading || !cityInput.trim()}
            className="px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              'Go'
            )}
          </button>

          <button
            type="button"
            onClick={clearSearch}
            disabled={!data && !cityInput && !error}
            className="w-11 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Clear search and return to the empty view"
            aria-label="Clear search and return to the empty view"
          >
            <RefreshCw className="w-4 h-4 mx-auto" />
          </button>

        </form>

      </div>


      {/* =====================================================
          MAIN APP LAYOUT
      ===================================================== */}

      <div className="flex flex-1 relative">


        {/* MOBILE OVERLAY */}

        <div
          onClick={() => setSidebarOpen(false)}
          className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300 ${
            sidebarOpen
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none'
          }`}
        />


        {/* ===================================================
            SIDEBAR
        =================================================== */}

        <aside
          className={`
            bg-white border-r border-slate-200
            flex flex-col
            transition-[transform,width,box-shadow] duration-300 ease-out
            shadow-xl lg:shadow-none
            overflow-hidden
            z-50

            fixed lg:sticky
            top-16
            bottom-0
            left-0
            h-[calc(100vh-4rem)]
            self-start

            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}

            ${sidebarCollapsed ? 'lg:w-20' : 'w-64'}
          `}
        >

          {/* NAVIGATION */}

          <div className="flex-1 p-3 overflow-y-auto">

            {/* Mobile close */}

            <div className="lg:hidden flex items-center justify-between px-2 py-2 mb-3 border-b border-slate-200">

              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Navigation
              </span>

              <button
                onClick={() => setSidebarOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>

            </div>


            {/* Dashboard */}

            <button
              onClick={() => navigateTo('dashboard')}
              title="Overview"
              className={`
                w-full flex items-center rounded-xl transition-all duration-200 mb-1
                ${sidebarCollapsed ? 'lg:justify-center lg:px-0' : 'justify-between px-3'}
                py-3

                ${
                  activeTab === 'dashboard'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-blue-700'
                }
              `}
            >

              <div className="flex items-center gap-3">

                <LayoutDashboard className="w-5 h-5 shrink-0" />

                <span className={`${sidebarCollapsed ? 'lg:hidden' : ''} text-sm font-semibold`}>
                  Overview
                </span>

              </div>

              <ChevronRight
                className={`${sidebarCollapsed ? 'lg:hidden' : ''} w-4 h-4 opacity-50`}
              />

            </button>


            {/* Analytics */}

            <button
              onClick={() => navigateTo('analytics')}
              title="Interactive Charts"
              className={`
                w-full flex items-center rounded-xl transition-all duration-200 mb-1
                ${sidebarCollapsed ? 'lg:justify-center lg:px-0' : 'justify-between px-3'}
                py-3

                ${
                  activeTab === 'analytics'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-blue-700'
                }
              `}
            >

              <div className="flex items-center gap-3">

                <BarChart2 className="w-5 h-5 shrink-0" />

                <span className={`${sidebarCollapsed ? 'lg:hidden' : ''} text-sm font-semibold`}>
                  Interactive Charts
                </span>

              </div>

              <ChevronRight
                className={`${sidebarCollapsed ? 'lg:hidden' : ''} w-4 h-4 opacity-50`}
              />

            </button>


            {/* Warnings */}

            <button
              onClick={() => navigateTo('warnings')}
              title={`Daily Advisories${data?.active_warnings?.length ? ` (${data.active_warnings.length} alerts)` : ''}`}
              className={`
                w-full flex items-center rounded-xl transition-all duration-200 mb-1
                ${sidebarCollapsed ? 'lg:justify-center lg:px-0' : 'justify-between px-3'}
                py-3

                ${
                  activeTab === 'warnings'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-blue-700'
                }
              `}
            >

              <div className="flex items-center gap-3">

                <span className="relative shrink-0">
                  <AlertTriangle className="w-5 h-5" />

                  {data?.active_warnings?.length > 0 && !alertsViewed && (
                    <span className="absolute -right-2 -top-2 flex min-w-4 h-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm animate-pulse">
                      {data.active_warnings.length}
                    </span>
                  )}
                </span>

                <span className={`${sidebarCollapsed ? 'lg:hidden' : ''} text-sm font-semibold`}>
                  Daily Advisories
                </span>

              </div>


            </button>


            {/* Telemetry */}

            <button
              onClick={() => navigateTo('telemetry')}
              title="Telemetry Logs"
              className={`
                w-full flex items-center rounded-xl transition-all duration-200 mb-1
                ${sidebarCollapsed ? 'lg:justify-center lg:px-0' : 'justify-between px-3'}
                py-3

                ${
                  activeTab === 'telemetry'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-blue-700'
                }
              `}
            >

              <div className="flex items-center gap-3">

                <Table className="w-5 h-5 shrink-0" />

                <span className={`${sidebarCollapsed ? 'lg:hidden' : ''} text-sm font-semibold`}>
                  Telemetry Logs
                </span>

              </div>

              <ChevronRight
                className={`${sidebarCollapsed ? 'lg:hidden' : ''} w-4 h-4 opacity-50`}
              />

            </button>


            {/* Documentation */}

            <button
              onClick={() => navigateTo('help')}
              title="Documentation"
              className={`
                w-full flex items-center rounded-xl transition-all duration-200
                ${sidebarCollapsed ? 'lg:justify-center lg:px-0' : 'justify-between px-3'}
                py-3

                ${
                  activeTab === 'help'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-blue-700'
                }
              `}
            >

              <div className="flex items-center gap-3">

                <HelpCircle className="w-5 h-5 shrink-0" />

                <span className={`${sidebarCollapsed ? 'lg:hidden' : ''} text-sm font-semibold`}>
                  Documentation
                </span>

              </div>

              <ChevronRight
                className={`${sidebarCollapsed ? 'lg:hidden' : ''} w-4 h-4 opacity-50`}
              />

            </button>

          </div>


          {/* SIDEBAR FOOTER */}

          <div className="border-t border-slate-200 p-3">

            <div
              className={`
                rounded-xl bg-blue-50 border border-blue-100
                ${sidebarCollapsed ? 'lg:p-2 lg:flex lg:justify-center' : 'p-3'}
              `}
            >

              <div className="flex items-start gap-2.5">

                <CloudSun className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />

                <div className={`${sidebarCollapsed ? 'lg:hidden' : ''}`}>

                  <div className="text-xs font-bold text-blue-900">
                    Open-Meteo
                  </div>

                  <div className="text-[10px] text-blue-700 mt-0.5">
                    30-Day Archive + 7-Day Forecast
                  </div>

                </div>

              </div>

            </div>

          </div>

        </aside>


        {/* ===================================================
            MAIN CONTENT
        =================================================== */}

        <main className="flex-1 min-w-0 flex flex-col">

          <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">


            {/* ERROR */}

            {error && (
              <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-start gap-3">

                <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />

                <div>
                  <div className="font-semibold text-sm">
                    Unable to load data
                  </div>

                  <div className="text-sm mt-1">
                    {error}
                  </div>
                </div>

              </div>
            )}


            {/* =================================================
                EMPTY STATE
            ================================================= */}

            {!data && !loading && !error && (

              <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center">

                <div className="w-full max-w-2xl text-center">

                  <div className="mx-auto w-20 h-20 rounded-3xl bg-blue-50 border border-blue-100 flex items-center justify-center">

                    <CloudSun className="w-10 h-10 text-blue-600" />

                  </div>


                  <h1 className="text-3xl sm:text-4xl font-extrabold text-blue-900 mt-6">
                    Start Your Weather Analysis
                  </h1>


                  <p className="text-slate-600 mt-3 max-w-xl mx-auto leading-7">
                    Search for a city to analyze historical weather,
                    temperature, humidity, wind conditions and air
                    quality metrics.
                  </p>


                  <div className="grid sm:grid-cols-3 gap-3 mt-10">

                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <Database className="w-5 h-5 text-blue-600 mx-auto" />
                      <div className="text-xs font-semibold text-slate-700 mt-2">
                        Historical Data
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <BarChart2 className="w-5 h-5 text-blue-600 mx-auto" />
                      <div className="text-xs font-semibold text-slate-700 mt-2">
                        Visual Analytics
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <AlertTriangle className="w-5 h-5 text-blue-600 mx-auto" />
                      <div className="text-xs font-semibold text-slate-700 mt-2">
                        Safety Alerts
                      </div>
                    </div>

                  </div>

                </div>

              </div>

            )}


            {/* =================================================
                DATA APPLICATION
            ================================================= */}

            {data && (

              <>


                {/* =================================================
                    DASHBOARD
                ================================================= */}

                {activeTab === 'dashboard' && (

                  <div className="space-y-6">


                    {/* PAGE HEADER */}

                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                      <div>

                        <div className="flex items-center gap-2 text-sm text-blue-600 font-semibold mb-2">

                          <MapPin className="w-4 h-4" />

                          Weather Analysis

                        </div>

                        <h1 className="text-2xl sm:text-3xl font-boldtext-slate-100 leading-[1.08]">
                          {data.location}
                        </h1>

                        <p className="text-sm text-slate-500 mt-1">
                          Historical and forecast climate telemetry overview
                        </p>

                      </div>


                      <div className="flex items-center gap-3">

                        <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">

                          <span className="w-2 h-2 rounded-full bg-emerald-500" />

                          Data Available

                        </span>


                      </div>

                    </div>


                    {/* METRIC CARDS */}

                    <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-2 xl:max-w-4xl mx-auto">

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('analytics');
                          setActiveVizTab('temp');
                        }}
                        className={`group relative overflow-hidden text-left border rounded-2xl p-3 h-32 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 ${
                          temperatureState === 'hot'
                            ? 'border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-100 focus:ring-orange-200'
                            : temperatureState === 'warm'
                              ? 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50 focus:ring-amber-200'
                              : 'border-slate-200 bg-gradient-to-br from-slate-100 via-blue-50 to-white focus:ring-blue-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                            temperatureState === 'hot'
                              ? 'bg-orange-100 text-orange-600'
                              : temperatureState === 'warm'
                                ? 'bg-amber-50 text-amber-600'
                                : 'bg-blue-50 text-blue-600'
                          }`}>
                            {temperatureState === 'hot' ? (
                              <Sun className="w-5 h-5 transition-transform duration-500 group-hover:scale-150 group-hover:rotate-12" />
                            ) : temperatureState === 'warm' ? (
                              <CloudSun className="w-5 h-5 transition-transform duration-500 group-hover:scale-125" />
                            ) : (
                              <Smile className="w-5 h-5 transition-transform duration-500 group-hover:scale-125" />
                            )}
                          </div>
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Temperature
                          </span>
                        </div>
                        <div className="mt-3 text-xl font-bold text-slate-100 leading-[1.08]">
                          {currentTelemetry?.temperature ?? '--'} °C
                        </div>
                        <div className={`text-xs mt-1 font-semibold ${
                          temperatureState === 'hot'
                            ? 'text-orange-600'
                            : temperatureState === 'warm'
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                        }`}>
                          {temperatureState === 'hot'
                            ? 'Hot conditions'
                            : temperatureState === 'warm'
                              ? 'Warm conditions'
                              : 'Comfortable temperature'}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('telemetry')}
                        className={`group relative overflow-hidden text-left border rounded-2xl p-3 h-32 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 ${
                          humidityState === 'humid'
                            ? 'border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-blue-100 focus:ring-cyan-200'
                            : humidityState === 'dry'
                              ? 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 focus:ring-amber-200'
                              : 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 focus:ring-emerald-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                            humidityState === 'humid'
                              ? 'bg-cyan-100 text-cyan-700'
                              : humidityState === 'dry'
                                ? 'bg-amber-50 text-amber-600'
                                : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {humidityState === 'comfortable' ? (
                              <Smile className="w-5 h-5 transition-transform duration-500 group-hover:scale-125" />
                            ) : (
                              <Droplets className="w-5 h-5 transition-transform duration-500 group-hover:scale-125" />
                            )}
                          </div>
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Humidity
                          </span>
                        </div>
                        <div className="mt-3 text-xl font-bold text-slate-100 leading-[1.08]">
                          {currentTelemetry?.humidity ?? '--'}%
                        </div>
                        <div className={`text-xs mt-1 font-semibold ${
                          humidityState === 'comfortable'
                            ? 'text-emerald-600'
                            : 'text-amber-600'
                        }`}>
                          {humidityState === 'humid'
                            ? 'High humidity'
                            : humidityState === 'dry'
                              ? 'Dry air'
                              : 'Comfortable humidity'}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('telemetry')}
                        className={`group relative overflow-hidden text-left border rounded-2xl p-3 h-32 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 ${
                          windState === 'high'
                            ? 'border-orange-200 bg-gradient-to-br from-orange-50 via-white to-rose-50 focus:ring-orange-200'
                            : 'border-slate-200 bg-gradient-to-br from-slate-100 via-white to-sky-50 focus:ring-sky-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                            windState === 'high'
                              ? 'bg-orange-100 text-orange-600'
                              : 'bg-sky-50 text-sky-600'
                          }`}>
                            <Wind className="w-5 h-5 transition-transform duration-500 group-hover:scale-125" />
                          </div>
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Wind Speed
                          </span>
                        </div>
                        <div className="mt-3 text-xl font-bold text-slate-100 leading-[1.08]">
                          {currentTelemetry?.wind_speed ?? '--'}
                          <span className="text-base font-medium ml-1">km/h</span>
                        </div>
                        <div className={`text-xs mt-1 font-semibold ${
                          windState === 'high' ? 'text-orange-600' : 'text-sky-600'
                        }`}>
                          {windState === 'high' ? 'High wind alert' : 'Normal wind speed'}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('analytics');
                          setActiveVizTab('aqi_bar');
                        }}
                        className={`group relative overflow-hidden text-left border rounded-2xl p-3 h-32 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 ${
                          aqiState === 'unhealthy'
                            ? 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-red-100 focus:ring-rose-200'
                            : aqiState === 'moderate'
                              ? 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 focus:ring-amber-200'
                              : 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 focus:ring-emerald-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                            aqiState === 'unhealthy'
                              ? 'bg-rose-100 text-rose-600'
                              : aqiState === 'moderate'
                                ? 'bg-amber-50 text-amber-600'
                                : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {aqiState === 'unhealthy' ? (
                              <Frown className="w-5 h-5 transition-transform duration-500 group-hover:scale-125" />
                            ) : (
                              <Activity className="w-5 h-5 transition-transform duration-500 group-hover:scale-125" />
                            )}
                          </div>
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            AQI
                          </span>
                        </div>
                        <div className="mt-3 text-xl font-bold text-slate-100 leading-[1.08]">
                          {currentAqi}
                        </div>
                        <div className={`text-xs mt-1 font-semibold ${
                          aqiState === 'unhealthy'
                            ? 'text-rose-600'
                            : aqiState === 'moderate'
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                        }`}>
                          {aqiState === 'unhealthy'
                            ? 'Unhealthy AQI'
                            : aqiState === 'moderate'
                              ? 'Moderate AQI'
                              : 'Good AQI'}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('analytics');
                          setActiveVizTab('rain');
                        }}
                        className={`group relative overflow-hidden text-left border rounded-2xl p-3 h-32 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 ${
                          rainState === 'cloudy'
                            ? 'border-slate-300 bg-gradient-to-br from-slate-200 via-white to-blue-100 focus:ring-slate-300'
                            : 'border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50 focus:ring-amber-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                            rainState === 'cloudy'
                              ? 'bg-slate-200 text-slate-600'
                              : 'bg-amber-50 text-amber-500'
                          }`}>
                            {rainState === 'cloudy' ? (
                              <Cloud className="w-5 h-5 transition-transform duration-500 group-hover:scale-125" />
                            ) : (
                              <Sun className="w-5 h-5 transition-transform duration-500 group-hover:scale-125 group-hover:rotate-12" />
                            )}
                          </div>
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Rain Probability
                          </span>
                        </div>
                        <div className="mt-3 text-xl font-bold text-slate-100 leading-[1.08]">
                          {currentTelemetry?.rain_probability ?? '--'}%
                        </div>
                        <div className={`text-xs mt-1 font-semibold ${
                          rainState === 'cloudy' ? 'text-slate-600' : 'text-amber-600'
                        }`}>
                          {rainState === 'cloudy' ? 'Cloudy conditions likely' : 'Sunny conditions likely'}
                        </div>
                      </button>

                    </div>


                    {/* WARNINGS */}

                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

                      <div className="px-5 sm:px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

                        <div className="flex items-center gap-3">

                          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                          </div>

                          <div>

                            <h2 className="font-bold text-slate-900">
                              Daily Safety Warnings
                            </h2>

                            <p className="text-xs text-slate-500 mt-0.5">
                              Automated threshold monitoring
                            </p>

                          </div>

                        </div>


                        <button
                          onClick={() => navigateTo('warnings')}
                          className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          View all
                          <ArrowRight className="w-4 h-4" />
                        </button>

                      </div>


                      <div className="p-5 sm:p-6">

                        {data.active_warnings?.length > 0 ? (

                          <div className="grid md:grid-cols-2 gap-3">

                            {data.active_warnings.map((w) => (

                              <div
                                key={w.id}
                                className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-4"
                              >

                                <div>

                                  <span className="text-xs font-bold text-amber-700 uppercase">
                                    {w.type}
                                  </span>

                                  <p className="text-sm text-slate-700 mt-1">
                                    {w.message}
                                  </p>

                                </div>


                                <span className="shrink-0 px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-xs font-semibold text-slate-700">
                                  {w.metric}
                                </span>

                              </div>

                            ))}

                          </div>

                        ) : (

                          <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">

                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />

                            <div>

                              <div className="font-semibold text-emerald-800 text-sm">
                                All monitored parameters are within configured ranges.
                              </div>

                              <div className="text-xs text-emerald-700 mt-0.5">
                                No active temperature, wind, humidity or PM2.5 warning detected.
                              </div>

                            </div>

                          </div>

                        )}

                      </div>

                    </div>

                  </div>

                )}


                {/* =================================================
                    ANALYTICS
                ================================================= */}

                {activeTab === 'analytics' && (

                  <div className="space-y-6">

                    <div>

                      <div className="flex items-center gap-2 text-sm font-semibold text-blue-600">
                        <BarChart2 className="w-4 h-4" />
                        Analytics
                      </div>

                      <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 leading-[1.08] mt-2">
                        Interactive Visualization
                      </h1>

                      <p className="text-sm text-slate-500 mt-1">
                        Explore temperature and air-quality trends.
                      </p>

                    </div>


                    {/* CHART TABS */}

                    <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">

                        <button
                          onClick={() => setActiveVizTab('temp')}
                          className={`px-4 py-3 rounded-xl text-sm font-semibold transition ${
                            activeVizTab === 'temp'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Temperature Trend
                        </button>


                        <button
                          onClick={() => setActiveVizTab('pm_pie')}
                          className={`px-4 py-3 rounded-xl text-sm font-semibold transition ${
                            activeVizTab === 'pm_pie'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Pollutants Breakdown
                        </button>


                        <button
                          onClick={() => setActiveVizTab('aqi_bar')}
                          className={`px-4 py-3 rounded-xl text-sm font-semibold transition ${
                            activeVizTab === 'aqi_bar'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Air Quality
                        </button>


                        <button
                          onClick={() => setActiveVizTab('rain')}
                          className={`px-4 py-3 rounded-xl text-sm font-semibold transition ${
                            activeVizTab === 'rain'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Rain Report
                        </button>

                      </div>

                    </div>


                    {(

                      <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">

                        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Chart range — {chartRange === 'monthly' ? 'Last 12 months' : 'Last 7 days'}
                        </span>

                        <div className="grid grid-cols-2 gap-1">

                          <button
                            onClick={() => setChartRange('daily')}
                            title="Show last 7 days in chart"
                            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                              chartRange === 'daily'
                                ? 'bg-white text-blue-700 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            Daily (7D)
                          </button>

                          <button
                            onClick={() => setChartRange('monthly')}
                            title="Show last 12 months in chart"
                            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                              chartRange === 'monthly'
                                ? 'bg-white text-blue-700 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            Monthly (12M)
                          </button>

                        </div>

                      </div>

                    )}


                    {/* CHART */}

                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-6">

                      <div className="h-[380px] w-full">

                        {activeVizTab === 'temp' && (

                          <ResponsiveContainer width="100%" height="100%">

                            <LineChart data={getChartPeriodData()}>

                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#e2e8f0"
                              />

                              <XAxis
                                dataKey="period"
                                tickFormatter={(str) =>
                                  new Date(
                                    `${str}${str.length === 7 ? '-01' : ''}T00:00:00`
                                  ).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: chartRange === 'daily' ? 'numeric' : undefined,
                                    year: chartRange === 'monthly' ? 'numeric' : undefined
                                  })
                                }
                                stroke="#64748b"
                                fontSize={11}
                              />

                              <YAxis
                                unit=" °C"
                                stroke="#64748b"
                                fontSize={11}
                              />

                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#ffffff',
                                  borderColor: '#cbd5e1',
                                  borderRadius: '12px',
                                  color: '#0f172a'
                                }}
                              />

                              <Legend />

                              <Line
                                type="monotone"
                                dataKey="averageTemperature"
                                name="Average Temperature (°C)"
                                stroke="#2563eb"
                                dot={false}
                                strokeWidth={2.5}
                              />

                              <Line
                                type="monotone"
                                dataKey="averageMovingAverage"
                                name="Average Trend"
                                stroke="#0f766e"
                                dot={false}
                                strokeWidth={2}
                              />

                            </LineChart>

                          </ResponsiveContainer>

                        )}


                        {activeVizTab === 'pm_pie' && (

                          <ResponsiveContainer width="100%" height="100%">

                            <PieChart>

                              <Pie
                                data={getPieChartData()}
                                cx="50%"
                                cy="50%"
                                innerRadius={75}
                                outerRadius={120}
                                paddingAngle={4}
                                dataKey="value"
                              >

                                {getPieChartData().map((entry, index) => (

                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                  />

                                ))}

                              </Pie>

                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#ffffff',
                                  borderColor: '#cbd5e1',
                                  borderRadius: '12px'
                                }}
                              />

                              <Legend />

                            </PieChart>

                          </ResponsiveContainer>

                        )}


                        {activeVizTab === 'aqi_bar' && (

                          <ResponsiveContainer width="100%" height="100%">

                              <BarChart data={getAirQualityIndexData()}>

                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#e2e8f0"
                              />

                              <XAxis
                                dataKey="period"
                                tickFormatter={(str) =>
                                  new Date(
                                    `${str}${str.length === 7 ? '-01' : ''}T00:00:00`
                                  ).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: chartRange === 'daily' ? 'numeric' : undefined,
                                    year: chartRange === 'monthly' ? 'numeric' : undefined
                                  })
                                }
                                stroke="#64748b"
                                fontSize={11}
                              />

                              <YAxis
                                domain={[0, 500]}
                                label={{
                                  value: 'AQI Index (0-500)',
                                  angle: -90,
                                  position: 'insideLeft',
                                  style: {
                                    textAnchor: 'middle',
                                    fill: '#64748b',
                                    fontSize: 11
                                  }
                                }}
                                stroke="#64748b"
                                fontSize={11}
                              />

                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#ffffff',
                                  borderColor: '#cbd5e1',
                                  borderRadius: '12px'
                                }}
                              />

                              <Legend />

                              <Bar
                                dataKey="overall_aqi"
                                name="Overall AQI (index)"
                                radius={[5, 5, 0, 0]}
                              >
                                {getAirQualityIndexData().map((entry, index) => (
                                  <Cell
                                    key={`aqi-cell-${index}`}
                                    fill={getAqiColor(entry.overall_aqi)}
                                  />
                                ))}
                              </Bar>

                            </BarChart>

                          </ResponsiveContainer>

                        )}


                        {activeVizTab === 'rain' && (

                          <ResponsiveContainer width="100%" height="100%">

                            <LineChart data={getChartPeriodData()}>

                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#e2e8f0"
                              />

                              <XAxis
                                dataKey="period"
                                tickFormatter={(str) =>
                                  new Date(
                                    `${str}${str.length === 7 ? '-01' : ''}T00:00:00`
                                  ).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: chartRange === 'daily' ? 'numeric' : undefined,
                                    year: chartRange === 'monthly' ? 'numeric' : undefined
                                  })
                                }
                                stroke="#64748b"
                                fontSize={11}
                              />

                              <YAxis
                                yAxisId="probability"
                                domain={[0, 100]}
                                unit="%"
                                stroke="#2563eb"
                                fontSize={11}
                              />

                              <YAxis
                                yAxisId="rain"
                                orientation="right"
                                unit=" mm"
                                stroke="#0f766e"
                                fontSize={11}
                              />

                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#ffffff',
                                  borderColor: '#cbd5e1',
                                  borderRadius: '12px',
                                  color: '#0f172a'
                                }}
                              />

                              <Legend />

                              <Line
                                yAxisId="probability"
                                type="monotone"
                                dataKey="rain_probability"
                                name="Rain Probability (%)"
                                stroke="#2563eb"
                                dot={false}
                                strokeWidth={2.5}
                              />

                              <Line
                                yAxisId="rain"
                                type="monotone"
                                dataKey="precipitation"
                                name="Precipitation (mm)"
                                stroke="#0f766e"
                                dot={false}
                                strokeWidth={2.5}
                              />

                            </LineChart>

                          </ResponsiveContainer>

                        )}

                      </div>

                    </div>

                  </div>

                )}


                {/* =================================================
                    WARNINGS
                ================================================= */}

                {activeTab === 'warnings' && (

                  <div className="space-y-6">

                    <div>

                      <div className="flex items-center gap-2 text-sm font-semibold text-amber-600">
                        <AlertTriangle className="w-4 h-4" />
                        Safety Monitoring
                      </div>

                      <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 leading-[1.08] mt-2">
                        Safety Advisories
                      </h1>

                      <p className="text-sm text-slate-500 mt-1">
                        Threshold-based warnings generated from weather telemetry.
                      </p>

                    </div>


                    {data.active_warnings?.length > 0 ? (

                      <div className="grid lg:grid-cols-2 gap-5">

                        {data.active_warnings.map((warn) => (

                          <div
                            key={warn.id}
                            className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                              warn.severity === 'high'
                                ? 'border-rose-200'
                                : 'border-amber-200'
                            }`}
                          >

                            <div
                              className={`px-5 py-4 border-b ${
                                warn.severity === 'high'
                                  ? 'bg-rose-50 border-rose-100'
                                  : 'bg-amber-50 border-amber-100'
                              }`}
                            >

                              <div className="flex items-center justify-between gap-3">

                                <div className="flex items-center gap-3">

                                  <span
                                    className={`w-3 h-3 rounded-full ${
                                      warn.severity === 'high'
                                        ? 'bg-rose-500'
                                        : 'bg-amber-500'
                                    }`}
                                  />

                                  <h3 className="font-bold text-slate-900">
                                    {warn.type}
                                  </h3>

                                </div>


                                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700">
                                  {warn.metric}
                                </span>

                              </div>

                            </div>


                            <div className="p-5">

                              <p className="text-sm text-slate-700 leading-6">
                                {warn.message}
                              </p>


                              <div className="mt-5 p-4 rounded-xl bg-blue-50 border border-blue-100">

                                <div className="flex items-start gap-3">

                                  <Info className="w-5 h-5 text-blue-600 shrink-0" />

                                  <div>

                                    <div className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                                      Recommended Action
                                    </div>

                                    <div className="text-sm text-slate-700 mt-1 leading-6">
                                      {warn.precaution}
                                    </div>

                                  </div>

                                </div>

                              </div>

                            </div>

                          </div>

                        ))}

                      </div>

                    ) : (

                      <div className="bg-white border border-emerald-200 rounded-2xl p-12 text-center shadow-sm">

                        <div className="w-16 h-16 rounded-2xl bg-emerald-50 mx-auto flex items-center justify-center">

                          <CheckCircle2 className="w-8 h-8 text-emerald-600" />

                        </div>

                        <h3 className="text-xl font-bold text-slate-900 mt-5">
                          All Parameters Normal
                        </h3>

                        <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
                          No active heat, wind, air quality or cold
                          alerts were triggered for the current dataset.
                        </p>

                      </div>

                    )}

                  </div>

                )}


                {/* =================================================
                    TELEMETRY
                ================================================= */}

                {activeTab === 'telemetry' && (

                  <div className="space-y-6">

                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">

                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-blue-600">
                          <Table className="w-4 h-4" />
                          Data Records
                        </div>

                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 leading-[1.08] mt-2">
                          Hourly Telemetry
                        </h1>

                        <p className="text-sm text-slate-500 mt-1">
                          Processed hourly environmental measurements.
                        </p>
                      </div>

                      <label className="flex items-center gap-3 text-sm font-semibold text-slate-600">
                        <span className="whitespace-nowrap">View date</span>
                        <select
                          value={selectedDate}
                          onChange={handleDateChange}
                          disabled={loading || !data.available_dates?.length}
                          className="min-w-40 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {data.available_dates?.map((date) => (
                            <option key={date} value={date}>
                              {date}
                            </option>
                          ))}
                        </select>
                      </label>

                    </div>


                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                      <div className="overflow-x-auto max-h-[560px]">

                        <table className="w-full text-left text-sm">

                          <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200 z-10">

                            <tr>

                              <th className="px-5 py-4 font-bold">
                                Timestamp
                              </th>

                              <th className="px-5 py-4 font-bold">
                                Temp
                              </th>

                              <th className="px-5 py-4 font-bold">
                                Humidity
                              </th>

                              <th className="px-5 py-4 font-bold">
                                Pressure
                              </th>

                              <th className="px-5 py-4 font-bold">
                                Wind
                              </th>

                              <th className="px-5 py-4 font-bold">
                                Rain Probability
                              </th>

                            </tr>

                          </thead>


                          <tbody>

                            {telemetryRows.length > 0
                              ? telemetryRows.map(renderTableRow)
                              : data.hourly_data
                                  .slice(0, 24)
                                  .map(renderTableRow)}

                          </tbody>

                        </table>

                      </div>

                    </div>

                  </div>

                )}


                {/* =================================================
                    DOCUMENTATION
                ================================================= */}

                {activeTab === 'help' && (

                  <div className="space-y-6">

                    <div>

                      <div className="flex items-center gap-2 text-sm font-semibold text-blue-600">
                        <HelpCircle className="w-4 h-4" />
                        Documentation
                      </div>

                      <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 leading-[1.08] mt-2">
                        Threshold Standards
                      </h1>

                      <p className="text-sm text-slate-500 mt-1">
                        Definitions used by the application's warning system.
                      </p>

                    </div>


                    <div className="grid md:grid-cols-2 gap-5">


                      {/* AIR QUALITY */}

                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">

                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-4">

                          <Activity className="w-5 h-5 text-blue-600" />

                        </div>

                        <h3 className="font-bold text-lg text-slate-900">
                          Air Quality Thresholds
                        </h3>

                        <p className="text-sm text-slate-600 leading-7 mt-3">

                          PM2.5 concentrations exceeding
                          <strong className="text-slate-900">
                            {' '}60 µg/m³
                          </strong>
                          {' '}trigger an active alert advising users
                          to wear protective masks and limit
                          high-exertion outdoor activities.

                        </p>

                      </div>


                      {/* THERMAL */}

                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">

                        <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center mb-4">

                          <Thermometer className="w-5 h-5 text-rose-600" />

                        </div>

                        <h3 className="font-bold text-lg text-slate-900">
                          Thermal Boundaries
                        </h3>

                        <p className="text-sm text-slate-600 leading-7 mt-3">

                          Temperatures exceeding
                          <strong className="text-slate-900">
                            {' '}35°C
                          </strong>
                          {' '}generate extreme heat advisories,
                          while sustained readings below
                          <strong className="text-slate-900">
                            {' '}5°C
                          </strong>
                          {' '}issue freezing advisories.

                        </p>

                      </div>


                      {/* DATA SOURCE */}

                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">

                        <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center mb-4">

                          <CloudSun className="w-5 h-5 text-sky-600" />

                        </div>

                        <h3 className="font-bold text-lg text-slate-900">
                          Weather Data
                        </h3>

                        <p className="text-sm text-slate-600 leading-7 mt-3">

                          The application uses Open-Meteo integration
                          to retrieve historical and forecast weather
                          information for the selected location.

                        </p>

                      </div>


                      {/* ANALYTICS */}

                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">

                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">

                          <BarChart2 className="w-5 h-5 text-emerald-600" />

                        </div>

                        <h3 className="font-bold text-lg text-slate-900">
                          Analytics Processing
                        </h3>

                        <p className="text-sm text-slate-600 leading-7 mt-3">

                          Processed telemetry is presented through
                          summary metrics, interactive visualizations,
                          warning indicators and detailed hourly records.

                        </p>

                      </div>

                    </div>

                  </div>

                )}

              </>

            )}

          </div>


          {/* =====================================================
              APPLICATION FOOTER
          ===================================================== */}

          <footer className="border-t border-slate-200 bg-white mt-8">

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">

                <div className="flex items-center gap-2">

                  <CloudSun className="w-4 h-4 text-blue-600" />

                  <span className="text-xs font-semibold text-slate-700">
                    ClimateHub 
                  </span>

                </div>


                <div className="text-xs text-slate-500 text-center">
                  Weather & Climate Data Analysis Platform
                </div>


                <button
                  onClick={returnToLanding}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  
                </button>

              </div>

            </div>

          </footer>

        </main>

      </div>

    </div>
  );
}
