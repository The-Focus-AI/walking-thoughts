"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cacheShellResources } from "@/lib/offline-shell";

export function OfflineReadiness() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    cacheShellResources([
      "/",
      "/offline",
      "/offline-maps",
      "/threads",
      "/journal",
      "/manifest.webmanifest",
      "/icon-192.svg",
      "/icon-512.svg",
    ])
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setReady(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <Link
      href="/offline-maps"
      className={ready ? "status status-ready" : "status"}
      title="App screens are ready offline. Opens the offline maps section to download the Offline Region trail pack."
    >
      <span className="status-dot" aria-hidden="true" />
      {ready ? "Shell ready" : "Caching shell…"}
    </Link>
  );
}
