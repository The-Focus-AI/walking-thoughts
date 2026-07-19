"use client";

import { useEffect, useState } from "react";
import { cacheShellResources } from "@/lib/offline-shell";

export function OfflineReadiness() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    cacheShellResources([
      "/",
      "/offline",
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
    <span className={ready ? "status status-ready" : "status"}>
      <span className="status-dot" aria-hidden="true" />
      {ready ? "Ready offline" : "Preparing offline…"}
    </span>
  );
}
