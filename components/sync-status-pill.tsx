"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCaptureStore } from "@/lib/local-capture/store";
import { SYNC_CYCLE_EVENT } from "@/lib/sync/cycle";
import { isSyncAuthBlocked, SYNC_AUTH_EVENT } from "@/lib/sync/session-state";
import {
  emptySyncRollup,
  syncRollup,
  type SyncRollup,
} from "@/lib/sync/rollup";

const REFRESH_INTERVAL_MS = 5_000;

type PillTone = "ready" | "busy" | "attention" | "offline";

function pillView(
  rollup: SyncRollup,
  online: boolean,
  authBlocked: boolean,
): { label: string; tone: PillTone } {
  // Only what has not reached the server counts as "syncing". A Capture in
  // "enriching" is safely uploaded and waiting on the desk's model queue —
  // calling the whole backlog "Syncing 111…" read as sync being broken.
  const uploading = rollup.saved_locally + rollup.syncing;
  // A refused session outranks the queue depth: nothing will move until the
  // walker signs in again, and "Syncing 1…" would be a lie about that.
  if (authBlocked && online) {
    return { label: "Sign in to sync", tone: "attention" };
  }
  if (rollup.needs_attention > 0) {
    return {
      label: `${rollup.needs_attention} need attention`,
      tone: "attention",
    };
  }
  if (!online) {
    return {
      label: uploading > 0 ? `Offline · ${uploading} on phone` : "Offline",
      tone: "offline",
    };
  }
  if (uploading > 0) {
    return { label: `Syncing ${uploading}…`, tone: "busy" };
  }
  if (rollup.enriching > 0) {
    return { label: `${rollup.enriching} enriching`, tone: "busy" };
  }
  return { label: "All synced", tone: "ready" };
}

/**
 * Glanceable Capture sync rollup. Links to Days, where each Thread carries
 * its own status chip.
 */
export function SyncStatusPill() {
  const [rollup, setRollup] = useState<SyncRollup>(emptySyncRollup());
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  // Read at mount rather than in an effect: the flag is already set by the
  // time a screen re-mounts mid-session.
  const [authBlocked, setAuthBlocked] = useState(isSyncAuthBlocked);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const captures = await getCaptureStore().list();
        if (!active) return;
        setRollup(syncRollup(captures.map((capture) => capture.status)));
      } catch {
        // Local storage unavailable; the pill stays at its last known state.
      }
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const onOnline = () => {
      setOnline(true);
      void refresh();
    };
    const onOffline = () => setOnline(false);
    const onCycle = () => void refresh();
    const onAuth = (event: Event) => {
      const detail = (event as CustomEvent<{ blocked: boolean }>).detail;
      setAuthBlocked(detail?.blocked ?? isSyncAuthBlocked());
    };
    window.addEventListener(SYNC_AUTH_EVENT, onAuth);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(SYNC_CYCLE_EVENT, onCycle);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(SYNC_CYCLE_EVENT, onCycle);
      window.removeEventListener(SYNC_AUTH_EVENT, onAuth);
    };
  }, []);

  const { label, tone } = pillView(rollup, online, authBlocked);

  return (
    <Link
      href={
        authBlocked && online
          ? "/sign-in"
          : rollup.needs_attention > 0
            ? "/days?f=attention"
            : "/days"
      }
      className={`sync-pill sync-pill-${tone}`}
      data-testid="sync-pill"
      title={
        authBlocked && online
          ? "The server refused this device's session — sign in again to sync"
          : rollup.needs_attention > 0
            ? "Open the stuck Threads and retry them"
            : "Capture sync status — open Days for per-Thread detail"
      }
    >
      <span className="sync-pill-dot" aria-hidden="true" />
      {label}
    </Link>
  );
}
