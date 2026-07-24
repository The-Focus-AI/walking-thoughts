import { expect, test } from "@playwright/test";
import {
  formatConditionsNote,
  formatWeatherCell,
  weatherFromOpenMeteo,
} from "@/lib/weather/format";
import type { OpenMeteoForecast } from "@/lib/weather/types";

/**
 * Public seams:
 * - formatWeatherCell / formatConditionsNote turn a forecast snapshot into
 *   InstrumentStrip copy (DESIGN.md V1 station strip).
 * - weatherFromOpenMeteo maps the Open-Meteo payload into that snapshot.
 * - Empty / missing data yields null so the strip omits the cell.
 */

test("formatWeatherCell prints temperature and wind for the strip", () => {
  expect(
    formatWeatherCell({
      temperatureF: 54,
      windMph: 8,
      windDirection: "NW",
      conditionsNote: null,
    }),
  ).toEqual({
    value: "54°F",
    sublabel: "NW 8 MPH",
  });
});

test("formatWeatherCell omits wind subline when wind is unavailable", () => {
  expect(
    formatWeatherCell({
      temperatureF: 61,
      windMph: null,
      windDirection: null,
      conditionsNote: null,
    }),
  ).toEqual({
    value: "61°F",
    sublabel: "Weather",
  });
});

test("formatConditionsNote is null when nothing is changing", () => {
  expect(formatConditionsNote(null)).toBeNull();
  expect(
    formatConditionsNote({
      temperatureF: 54,
      windMph: 8,
      windDirection: "NW",
      conditionsNote: null,
    }),
  ).toBeNull();
});

test("formatConditionsNote keeps the sun-line forecast call", () => {
  expect(
    formatConditionsNote({
      temperatureF: 54,
      windMph: 8,
      windDirection: "NW",
      conditionsNote: "☂ Rain likely by 13:00 — clouds building from the west",
    }),
  ).toBe("☂ Rain likely by 13:00 — clouds building from the west");
});

test("weatherFromOpenMeteo builds a snapshot and rain note from hourly odds", () => {
  const payload: OpenMeteoForecast = {
    current: {
      temperature_2m: 54.2,
      wind_speed_10m: 8.4,
      wind_direction_10m: 315,
      weather_code: 2,
      time: "2026-07-24T09:00",
    },
    hourly: {
      time: [
        "2026-07-24T09:00",
        "2026-07-24T10:00",
        "2026-07-24T11:00",
        "2026-07-24T12:00",
        "2026-07-24T13:00",
      ],
      precipitation_probability: [10, 15, 20, 45, 70],
    },
  };

  const snapshot = weatherFromOpenMeteo(payload, "2026-07-24T09:00");
  expect(snapshot).toEqual({
    temperatureF: 54,
    windMph: 8,
    windDirection: "NW",
    conditionsNote: "☂ Rain likely by 13:00 — precipitation odds climbing",
  });
});

test("weatherFromOpenMeteo returns null without a current reading", () => {
  expect(weatherFromOpenMeteo({ current: undefined, hourly: undefined })).toBeNull();
});
