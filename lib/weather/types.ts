/** Forecast snapshot for the home InstrumentStrip (DESIGN.md V1). */

export type WeatherSnapshot = {
  temperatureF: number;
  windMph: number | null;
  windDirection: string | null;
  /** Sun-colored conditions line under the strip; null when quiet. */
  conditionsNote: string | null;
};

/** Subset of the Open-Meteo forecast JSON we read. */
export type OpenMeteoForecast = {
  current?: {
    temperature_2m?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    weather_code?: number;
    time?: string;
  };
  hourly?: {
    time?: string[];
    precipitation_probability?: Array<number | null>;
  };
};

export type WeatherCell = {
  value: string;
  sublabel: string;
};
