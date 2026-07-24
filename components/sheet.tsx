"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  prefetchLocation,
  readAvailableLocation,
} from "@/lib/local-capture/location";
import type { CaptureLocation } from "@/lib/local-capture/types";
import { fetchWeatherSnapshot } from "@/lib/weather/fetch";
import {
  formatConditionsNote,
  formatWeatherCell,
} from "@/lib/weather/format";
import type { WeatherSnapshot } from "@/lib/weather/types";

/**
 * Quadrangle sheet fixtures (DESIGN.md): the centered survey masthead, the
 * instrument strip, and the scale-bar footer. Every printed value is a real
 * measurement — a fixture with no data renders nothing.
 */

const AGENCY_LINE = "Walking Thoughts · Provisional Survey";

function subscribeNever() {
  return () => undefined;
}

function useIsClient(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

export function SheetMasthead({ title }: { title?: string }) {
  const isClient = useIsClient();
  const dayLine = isClient
    ? new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <header className="masthead">
      <p className="masthead-agency">{AGENCY_LINE}</p>
      <p className="masthead-title">{title ?? "Trail Log"}</p>
      {dayLine ? <p className="masthead-date">{dayLine}</p> : null}
    </header>
  );
}

/**
 * Ruled instrument cells under the masthead. Only measured cells render;
 * with no fix on hand the strip is absent, not empty (DESIGN.md).
 */
export function InstrumentStrip() {
  const [location, setLocation] = useState<CaptureLocation | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  useEffect(() => {
    prefetchLocation();

    const apply = () => {
      const next = readAvailableLocation();
      if (next) {
        setLocation(next);
        return true;
      }
      return false;
    };

    if (apply()) return;

    const timer = window.setInterval(() => {
      if (apply()) window.clearInterval(timer);
    }, 400);
    const stop = window.setTimeout(() => window.clearInterval(timer), 8_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, []);

  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    void fetchWeatherSnapshot(location.latitude, location.longitude).then(
      (snapshot) => {
        if (!cancelled) setWeather(snapshot);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [location]);

  if (!location && !weather) return null;

  const weatherCell = weather ? formatWeatherCell(weather) : null;
  const conditionsNote = formatConditionsNote(weather);

  return (
    <div className="instrument-block">
      <div className="instrument-strip" role="group" aria-label="Instruments">
        {location ? (
          <div className="instrument-cell">
            <span className="instrument-value">
              {`${location.latitude.toFixed(4)}°, ${location.longitude.toFixed(4)}°`}
            </span>
            <span className="instrument-sublabel">Position · GPS</span>
          </div>
        ) : null}
        {weatherCell ? (
          <div className="instrument-cell instrument-cell-weather">
            <span className="instrument-value">{weatherCell.value}</span>
            <span className="instrument-sublabel">{weatherCell.sublabel}</span>
          </div>
        ) : null}
      </div>
      {conditionsNote ? (
        <p className="conditions-note">{conditionsNote}</p>
      ) : null}
    </div>
  );
}

/** The alternating survey scale bar that closes a sheet. Decorative form,
 * factual promise: the mono line below it is the sync contract. */
export function ScaleBar() {
  return (
    <span className="scale-bar" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((segment) => (
        <span key={segment} className="scale-bar-segment" />
      ))}
    </span>
  );
}
