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
      title="App screens cached on this device. Open Offline to download trail maps."
    >
      <span className="status-dot" aria-hidden="true" />
      {ready ? "App cached" : "Caching app…"}
    </Link>
  );
}
