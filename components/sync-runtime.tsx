"use client";

import { useEffect, useRef } from "react";
import { getCaptureStore } from "@/lib/local-capture/store";
import { runSyncCycle } from "@/lib/sync/cycle";

const DRAIN_INTERVAL_MS = 12_000;

/**
 * Shell-level outbox drain. Keeps Capture sync moving on authenticated screens
 * (home, Map Journal, Threads, Thread view) while open and online.
 */
export function SyncRuntime() {
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function drain() {
      if (cancelled || running.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      running.current = true;
      try {
        await runSyncCycle({ store: getCaptureStore(), online: true });
      } catch {
        // Statuses stay visible; the next tick retries.
      } finally {
        running.current = false;
      }
    }

    void drain();

    const interval = window.setInterval(() => {
      void drain();
    }, DRAIN_INTERVAL_MS);

    const onOnline = () => {
      void drain();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void drain();
      }
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
