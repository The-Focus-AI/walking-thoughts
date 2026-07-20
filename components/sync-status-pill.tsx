"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCaptureStore } from "@/lib/local-capture/store";
import { SYNC_CYCLE_EVENT } from "@/lib/sync/cycle";
import {
  emptySyncRollup,
  pendingSyncCount,
  syncRollup,
  type SyncRollup,
} from "@/lib/sync/rollup";

const REFRESH_INTERVAL_MS = 5_000;

type PillTone = "ready" | "busy" | "attention" | "offline";

function pillView(
  rollup: SyncRollup,
  online: boolean,
): { label: string; tone: PillTone } {
  const pending = pendingSyncCount(rollup);
  if (rollup.needs_attention > 0) {
    return {
      label: `${rollup.needs_attention} need attention`,
      tone: "attention",
    };
  }
  if (!online) {
    return {
      label: pending > 0 ? `Offline · ${pending} on phone` : "Offline",
      tone: "offline",
    };
  }
  if (pending > 0) {
    return { label: `Syncing ${pending}…`, tone: "busy" };
  }
  return { label: "All synced", tone: "ready" };
}

/**
 * Glanceable Capture sync rollup. Links to Threads, where each Thread carries
 * its own status chip.
 */
export function SyncStatusPill() {
  const [rollup, setRollup] = useState<SyncRollup>(emptySyncRollup());
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

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
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(SYNC_CYCLE_EVENT, onCycle);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(SYNC_CYCLE_EVENT, onCycle);
    };
  }, []);

  const { label, tone } = pillView(rollup, online);

  return (
    <Link
      href="/threads"
      className={`sync-pill sync-pill-${tone}`}
      data-testid="sync-pill"
      title="Capture sync status — open Threads for per-Thread detail"
    >
      <span className="sync-pill-dot" aria-hidden="true" />
      {label}
    </Link>
  );
}
