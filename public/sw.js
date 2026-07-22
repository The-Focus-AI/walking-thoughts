// Keep in sync with SHELL_CACHE_NAME in lib/offline-shell.ts.
const CACHE_NAME = "walking-thoughts-shell-v10";
const SHELL = [
  "/offline",
  "/journal",
  "/region-tracer",
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
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
    // Network-first, and every successful online visit refreshes the cached
    // shell copy — otherwise a deploy that leaves sw.js byte-identical would
    // strand offline walkers on the old build's HTML forever.
    event.respondWith(
      fetch(request)
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
        .catch(
          async () =>
            (await caches.match(url.pathname)) || caches.match("/offline"),
        ),
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
