"use client";

import { useEffect } from "react";

/**
 * Register the service worker on every page, including sign-in.
 *
 * Offline shell caching still lives in OfflineReadiness; this only makes the
 * app meet Chrome's installability criteria as soon as any surface loads, so
 * the browser menu can offer "Install app" without waiting for the trail
 * shell to mount.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => undefined);
  }, []);

  return null;
}
