import type { CaptureLocation } from "@/lib/local-capture/types";

export type NearbyPlace = {
  name: string;
  latitude: number;
  longitude: number;
};

export type NearbyPlaceResolver = {
  resolve(location: CaptureLocation): Promise<NearbyPlace | null>;
};

type PlaceGlobals = typeof globalThis & {
  __WT_PLACE_RESOLVER__?: NearbyPlaceResolver;
};

export function createFakePlaceResolver(
  places: NearbyPlace[] = [
    { name: "Example Creek Trailhead", latitude: 0, longitude: 0 },
  ],
): NearbyPlaceResolver {
  return {
    async resolve(location) {
      if (places.length === 0) return null;
      // Nearest by crude Euclidean distance for tests.
      let best = places[0];
      let bestDist = Number.POSITIVE_INFINITY;
      for (const place of places) {
        const dist =
          (place.latitude - location.latitude) ** 2 +
          (place.longitude - location.longitude) ** 2;
        if (dist < bestDist) {
          best = place;
          bestDist = dist;
        }
      }
      return { ...best, latitude: location.latitude, longitude: location.longitude };
    },
  };
}

/** OpenStreetMap Nominatim (no key). Disabled unless ENRICHMENT_GEOCODER=nominatim. */
function createNominatimResolver(): NearbyPlaceResolver {
  return {
    async resolve(location) {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("lat", String(location.latitude));
      url.searchParams.set("lon", String(location.longitude));
      url.searchParams.set("format", "json");
      const response = await fetch(url, {
        headers: { "user-agent": "walking-thoughts/0.1" },
      });
      if (!response.ok) return null;
      const body = (await response.json()) as {
        display_name?: string;
        name?: string;
      };
      const name = body.name || body.display_name;
      if (!name) return null;
      return {
        name,
        latitude: location.latitude,
        longitude: location.longitude,
      };
    },
  };
}

export function getNearbyPlaceResolver(
  environment: Record<string, string | undefined> = process.env,
): NearbyPlaceResolver {
  const injected = (globalThis as PlaceGlobals).__WT_PLACE_RESOLVER__;
  if (injected) return injected;
  if (environment.ENRICHMENT_GEOCODER === "nominatim") {
    return createNominatimResolver();
  }
  return createFakePlaceResolver([]);
}
