import type { CaptureLocation } from "./types";

const PROMPT_BUDGET_MS = 300;

type LocationReader = {
  /** Return coordinates already on hand; never waits on the GPS stack. */
  readAvailable(): CaptureLocation | null;
  /** Warm the cache in the background for a later commit. */
  prefetch(budgetMs?: number): void;
};

function coordsFromPosition(position: GeolocationPosition): CaptureLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  };
}

export function createLocationReader(
  geolocation: Geolocation | null = typeof navigator === "undefined"
    ? null
    : navigator.geolocation,
): LocationReader {
  let cached: CaptureLocation | null | undefined;
  let probing = false;

  function probe(budgetMs: number): void {
    if (!geolocation || probing || cached !== undefined) return;
    probing = true;

    const timer = window.setTimeout(() => {
      if (cached === undefined) cached = null;
      probing = false;
    }, budgetMs);

    try {
      geolocation.getCurrentPosition(
        (position) => {
          window.clearTimeout(timer);
          cached = coordsFromPosition(position);
          probing = false;
        },
        () => {
          window.clearTimeout(timer);
          cached = null;
          probing = false;
        },
        {
          enableHighAccuracy: false,
          maximumAge: 60_000,
          timeout: budgetMs,
        },
      );
    } catch {
      window.clearTimeout(timer);
      cached = null;
      probing = false;
    }
  }

  return {
    readAvailable() {
      return cached ?? null;
    },
    prefetch(budgetMs = PROMPT_BUDGET_MS) {
      probe(budgetMs);
    },
  };
}

const defaultReader =
  typeof window === "undefined" ? null : createLocationReader();

export function readAvailableLocation(): CaptureLocation | null {
  return defaultReader?.readAvailable() ?? null;
}

export function prefetchLocation(): void {
  defaultReader?.prefetch();
}
