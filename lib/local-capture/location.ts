import type { CaptureLocation } from "./types";

const PROMPT_BUDGET_MS = 300;
/** A fix older than this is re-requested on the next prefetch. */
const FIX_FRESH_MS = 60_000;

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
  let fix: CaptureLocation | null = null;
  let fixAt = 0;
  let denied = false;
  let probing = false;

  function probe(budgetMs: number): void {
    if (!geolocation || probing || denied) return;
    if (fix && Date.now() - fixAt < FIX_FRESH_MS) return;
    probing = true;

    // The GPS stack can simply never call back; free the slot regardless.
    const timer = window.setTimeout(() => {
      probing = false;
    }, budgetMs);

    try {
      geolocation.getCurrentPosition(
        (position) => {
          window.clearTimeout(timer);
          fix = coordsFromPosition(position);
          fixAt = Date.now();
          probing = false;
        },
        (error) => {
          window.clearTimeout(timer);
          // Only an explicit denial is final; a timeout or a cold GPS
          // stack may still deliver on a later, longer-budget probe.
          if (error.code === 1) denied = true;
          probing = false;
        },
        {
          enableHighAccuracy: false,
          maximumAge: FIX_FRESH_MS,
          timeout: budgetMs,
        },
      );
    } catch {
      window.clearTimeout(timer);
      probing = false;
    }
  }

  return {
    readAvailable() {
      return fix;
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

export function prefetchLocation(budgetMs?: number): void {
  defaultReader?.prefetch(budgetMs);
}
