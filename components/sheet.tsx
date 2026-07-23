"use client";

import { useEffect, useState } from "react";
import { readAvailableLocation } from "@/lib/local-capture/location";

/**
 * Quadrangle sheet fixtures (DESIGN.md): the centered survey masthead, the
 * instrument strip, and the scale-bar footer. Every printed value is a real
 * measurement — a fixture with no data renders nothing.
 */

const AGENCY_LINE = "Walking Thoughts · Provisional Survey";

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function SheetMasthead({ title }: { title?: string }) {
  const mounted = useMounted();
  const now = new Date();
  const dayLine = mounted
    ? now.toLocaleDateString(undefined, {
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
  const mounted = useMounted();
  if (!mounted) return null;
  const location = readAvailableLocation();
  if (!location) return null;

  const position = `${location.latitude.toFixed(4)}°, ${location.longitude.toFixed(4)}°`;

  return (
    <div className="instrument-strip" role="group" aria-label="Instruments">
      <div className="instrument-cell">
        <span className="instrument-value">{position}</span>
        <span className="instrument-sublabel">Position · GPS</span>
      </div>
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
