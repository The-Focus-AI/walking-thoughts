// Keep in sync with SHELL_CACHE_NAME in lib/offline-shell.ts.
const CACHE_NAME = "walking-thoughts-shell-v14";

// Every screen the bottom tab bar can reach, plus the app chrome. Each of
// these keeps a cached copy so a tab tap always lands on a page, with or
// without a network.
const SHELL = [
  "/",
  "/offline",
  "/days",
  "/journal",
  "/interview",
  "/offline-maps",
  "/region-tracer",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/fonts/barlow-condensed-500.woff2",
  "/fonts/barlow-condensed-600.woff2",
];

// A one-bar connection passes every online check and then stalls. Give the
// network this long to produce a page, then serve the cached shell instead.
const NAVIGATION_TIMEOUT_MS = 3500;

function fetchWithDeadline(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        SHELL.map(async (path) => {
          // Fetch each page individually: a signed-out redirect on one auth'd
          // page must neither poison the cache (a redirected response cannot
          // answer a navigation) nor fail the whole install.
          const response = await fetch(path);
          if (response.ok && !response.redirected) {
            await cache.put(path, response);
          }
        }),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    // Network-first with a deadline, and every successful online visit
    // refreshes the cached shell copy — otherwise a deploy that leaves sw.js
    // byte-identical would strand offline walkers on the old build's HTML
    // forever.
    event.respondWith(
      fetchWithDeadline(request, NAVIGATION_TIMEOUT_MS)
        .then((response) => {
          if (response.ok && SHELL.includes(url.pathname)) {
            const copy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(url.pathname, copy))
              .catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const exact = await caches.match(url.pathname);
          if (exact) return exact;
          // A day or Thread deep link has no cached copy of its own; the
          // Days workspace shell is the right room to land in, not the
          // capture screen.
          if (
            url.pathname.startsWith("/days/") ||
            url.pathname.startsWith("/threads/")
          ) {
            const days = await caches.match("/days");
            if (days) return days;
          }
          return caches.match("/offline");
        }),
    );
    return;
  }

  const isPublicShellAsset =
    url.pathname.startsWith("/_next/static/") ||
    SHELL.includes(url.pathname);
  if (!isPublicShellAsset) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Walking Thoughts",
    body: "Enrichment update",
    url: "/",
    tag: "walking-thoughts",
  };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // keep defaults
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate?.(targetUrl);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      }),
  );
});
