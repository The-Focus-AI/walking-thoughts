"use client";

/**
 * PROTOTYPE — throwaway UI exploration for trail home cleanup.
 *
 * Question: For density, sync glanceability, and map findability — what should
 * the trail surface look like on mobile and desktop?
 *
 * Run: pnpm dev → http://127.0.0.1:3000/prototype
 * Params: ?viewport=mobile|desktop&area=density|sync|map&variant=A|B|C
 */

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import {
  DENSITY_VARIANTS,
  DensityA,
  DensityB,
  DensityC,
} from "./density-variants";
import { MAP_VARIANTS, MapA, MapB, MapC } from "./map-variants";
import { SYNC_VARIANTS, SyncA, SyncB, SyncC } from "./sync-variants";
import "./prototype-trail.css";

const AREAS = [
  { key: "density", label: "Density" },
  { key: "sync", label: "Sync" },
  { key: "map", label: "Map" },
] as const;

const VIEWPORTS = [
  { key: "mobile", label: "Mobile" },
  { key: "desktop", label: "Desktop" },
] as const;

type AreaKey = (typeof AREAS)[number]["key"];
type ViewportKey = (typeof VIEWPORTS)[number]["key"];

function TrailCleanupPrototype() {
  const searchParams = useSearchParams();
  const area = (searchParams.get("area") ?? "density") as AreaKey;
  const variant = (searchParams.get("variant") ?? "A").toUpperCase();
  const viewport = (
    searchParams.get("viewport") === "desktop" ? "desktop" : "mobile"
  ) as ViewportKey;

  const options =
    area === "sync"
      ? [...SYNC_VARIANTS]
      : area === "map"
        ? [...MAP_VARIANTS]
        : [...DENSITY_VARIANTS];

  let body: ReactNode = null;
  if (area === "density") {
    body =
      variant === "B" ? (
        <DensityB />
      ) : variant === "C" ? (
        <DensityC />
      ) : (
        <DensityA />
      );
  } else if (area === "sync") {
    body =
      variant === "B" ? <SyncB /> : variant === "C" ? <SyncC /> : <SyncA />;
  } else {
    body = variant === "B" ? <MapB /> : variant === "C" ? <MapC /> : <MapA />;
  }

  return (
    <div
      className={`proto-viewport-stage viewport-${viewport}`}
      data-viewport={viewport}
    >
      <div className="proto-viewport-chrome" aria-hidden="true">
        <span>{viewport === "mobile" ? "Pixel · 390×844" : "Desktop · 1280×900"}</span>
        <span>
          {area} · {variant}
        </span>
      </div>
      <div className="proto-viewport-frame">{body}</div>
      <PrototypeSwitcher
        areaParam="area"
        areas={[...AREAS]}
        viewportParam="viewport"
        viewports={[...VIEWPORTS]}
        param="variant"
        options={options}
      />
    </div>
  );
}

export default function TrailCleanupPrototypePage() {
  return (
    <Suspense fallback={<p className="proto-pad">Loading prototype…</p>}>
      <TrailCleanupPrototype />
    </Suspense>
  );
}
