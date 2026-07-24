import type {
  OpenMeteoForecast,
  WeatherCell,
  WeatherSnapshot,
} from "./types";

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** Convert meteorological degrees to an 8-point compass label. */
export function windDirectionLabel(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return CARDINALS[index]!;
}

export function formatWeatherCell(snapshot: WeatherSnapshot): WeatherCell {
  const value = `${Math.round(snapshot.temperatureF)}°F`;
  if (snapshot.windMph == null || !snapshot.windDirection) {
    return { value, sublabel: "Weather" };
  }
  return {
    value,
    sublabel: `${snapshot.windDirection} ${Math.round(snapshot.windMph)} MPH`,
  };
}

export function formatConditionsNote(
  snapshot: WeatherSnapshot | null,
): string | null {
  return snapshot?.conditionsNote ?? null;
}

/**
 * Pick the soonest hour (within the next six) whose precipitation odds are
 * at least 50% and higher than the current hour — enough to call rain.
 */
function rainNote(
  hourly: OpenMeteoForecast["hourly"],
  nowIso: string,
): string | null {
  if (!hourly?.time?.length || !hourly.precipitation_probability?.length) {
    return null;
  }

  const now = new Date(nowIso).getTime();
  let currentOdds = 0;
  const upcoming: Array<{ time: string; odds: number }> = [];

  for (let i = 0; i < hourly.time.length; i += 1) {
    const stamp = hourly.time[i]!;
    const odds = hourly.precipitation_probability[i];
    if (odds == null) continue;
    const at = new Date(stamp).getTime();
    if (Number.isNaN(at)) continue;
    if (at <= now) {
      currentOdds = odds;
      continue;
    }
    if (upcoming.length >= 6) break;
    upcoming.push({ time: stamp, odds });
  }

  const hit = upcoming.find((slot) => slot.odds >= 50 && slot.odds > currentOdds);
  if (!hit) return null;

  const hour = new Date(hit.time).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `☂ Rain likely by ${hour} — precipitation odds climbing`;
}

export function weatherFromOpenMeteo(
  payload: OpenMeteoForecast,
  nowIso: string = new Date().toISOString(),
): WeatherSnapshot | null {
  const current = payload.current;
  if (current?.temperature_2m == null) return null;

  const windMph =
    current.wind_speed_10m == null ? null : Math.round(current.wind_speed_10m);
  const windDirection =
    current.wind_direction_10m == null
      ? null
      : windDirectionLabel(current.wind_direction_10m);

  return {
    temperatureF: Math.round(current.temperature_2m),
    windMph,
    windDirection,
    conditionsNote: rainNote(payload.hourly, nowIso),
  };
}
