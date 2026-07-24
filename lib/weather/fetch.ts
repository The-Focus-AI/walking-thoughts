import { weatherFromOpenMeteo } from "./format";
import type { OpenMeteoForecast, WeatherSnapshot } from "./types";

const CACHE_KEY = "wt-weather-snapshot";
const CACHE_TTL_MS = 30 * 60 * 1000;

type CachedWeather = {
  latitude: number;
  longitude: number;
  fetchedAt: number;
  snapshot: WeatherSnapshot;
};

function readCache(
  latitude: number,
  longitude: number,
): WeatherSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedWeather;
    if (
      Math.abs(cached.latitude - latitude) > 0.05 ||
      Math.abs(cached.longitude - longitude) > 0.05
    ) {
      return null;
    }
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
    return cached.snapshot;
  } catch {
    return null;
  }
}

function writeCache(
  latitude: number,
  longitude: number,
  snapshot: WeatherSnapshot,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: CachedWeather = {
      latitude,
      longitude,
      fetchedAt: Date.now(),
      snapshot,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Quota pressure only loses the cached forecast.
  }
}

/**
 * Fetch a short-range forecast for the walker's position. When offline,
 * returns a still-fresh cached snapshot so the strip survives brief gaps.
 * When online, always refreshes so the cell stays live.
 */
export async function fetchWeatherSnapshot(
  latitude: number,
  longitude: number,
  fetchImpl: typeof fetch = fetch,
): Promise<WeatherSnapshot | null> {
  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline) {
    return readCache(latitude, longitude);
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,wind_speed_10m,wind_direction_10m,weather_code",
  );
  url.searchParams.set("hourly", "precipitation_probability");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  try {
    const response = await fetchImpl(url.toString());
    if (!response.ok) return readCache(latitude, longitude);
    const payload = (await response.json()) as OpenMeteoForecast;
    const snapshot = weatherFromOpenMeteo(payload);
    if (snapshot) writeCache(latitude, longitude, snapshot);
    return snapshot ?? readCache(latitude, longitude);
  } catch {
    return readCache(latitude, longitude);
  }
}
