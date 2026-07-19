import type { GpsFix, LiveGpsSession } from "./types";

const LOW_ACCURACY_METERS = 100;

type GeolocationLike = Pick<Geolocation, "watchPosition" | "clearWatch">;

export function createLiveGpsSession(
  geolocation: GeolocationLike | undefined = globalThis.navigator?.geolocation,
  options: { lowAccuracyMeters?: number } = {},
): LiveGpsSession {
  const threshold = options.lowAccuracyMeters ?? LOW_ACCURACY_METERS;
  let watchId: number | null = null;
  let fix: GpsFix = { status: "pending" };
  const listeners = new Set<(next: GpsFix) => void>();

  const publish = (next: GpsFix) => {
    fix = next;
    for (const listener of listeners) listener(fix);
  };

  return {
    start() {
      if (watchId != null) return;
      if (!geolocation?.watchPosition) {
        publish({
          status: "unavailable",
          reason: "Geolocation is unavailable in this browser",
        });
        return;
      }
      publish({ status: "pending" });
      watchId = geolocation.watchPosition(
        (position) => {
          publish({
            status: "ready",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            lowAccuracy: position.coords.accuracy > threshold,
          });
        },
        (error) => {
          publish({
            status: "unavailable",
            reason:
              error.code === error.PERMISSION_DENIED
                ? "Location permission denied"
                : "Location is unavailable",
          });
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5_000,
          timeout: 15_000,
        },
      );
    },
    stop() {
      if (watchId != null && geolocation?.clearWatch) {
        geolocation.clearWatch(watchId);
      }
      watchId = null;
      publish({ status: "pending" });
    },
    read() {
      return fix;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(fix);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
