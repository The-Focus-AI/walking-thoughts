"use client";

import { useEffect, useState } from "react";

const CACHE_NAME = "walking-thoughts-shell-v4";

async function cacheLoadedShell(): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  const resourceUrls = performance
    .getEntriesByType("resource")
    .map((entry) => new URL(entry.name))
    .filter(
      (url) =>
        url.origin === window.location.origin &&
        url.pathname.startsWith("/_next/static/"),
    )
    .map((url) => url.pathname + url.search);

  const shellUrls = [
    "/offline",
    "/manifest.webmanifest",
    "/icon-192.svg",
    "/icon-512.svg",
    ...resourceUrls,
  ];
  await Promise.allSettled(
    [...new Set(shellUrls)].map((url) => cache.add(url)),
  );
}

export function OfflineReadiness() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("caches" in window)) return;

    let active = true;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then(cacheLoadedShell)
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
