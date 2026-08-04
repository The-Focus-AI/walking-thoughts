export const SHELL_CACHE_NAME = "walking-thoughts-shell-v14";

/** Matches the script and style paths a Next page HTML references. */
const STATIC_ASSET_PATTERN = /["'](\/_next\/static\/[^"'\s\\]+)["']/g;

/**
 * Register the service worker and cache the given shell pages plus every
 * static resource the current page already loaded, so the shell keeps
 * opening in airplane mode.
 */
export async function cacheShellResources(shellUrls: string[]): Promise<void> {
  if (!("serviceWorker" in navigator) || !("caches" in window)) {
    throw new Error("Service workers are unavailable");
  }

  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  const cache = await caches.open(SHELL_CACHE_NAME);
  const resourceUrls = performance
    .getEntriesByType("resource")
    .map((entry) => new URL(entry.name))
    .filter(
      (url) =>
        url.origin === window.location.origin &&
        url.pathname.startsWith("/_next/static/"),
    )
    .map((url) => url.pathname + url.search);

  await Promise.allSettled(
    [...new Set([...shellUrls, ...resourceUrls])].map((url) => cache.add(url)),
  );

  await cachePageAssets(cache, shellUrls);
}

/**
 * A cached page is only half the shell: its HTML names the route's own script
 * chunks, and a tab the walker never opened online would otherwise render
 * dead markup offline. Read each cached page and cache the assets it needs.
 */
async function cachePageAssets(
  cache: Cache,
  shellUrls: string[],
): Promise<void> {
  const assetPaths = new Set<string>();

  await Promise.allSettled(
    shellUrls.map(async (url) => {
      const cached = await cache.match(url);
      if (!cached) return;
      const contentType = cached.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) return;
      const html = await cached.clone().text();
      for (const match of html.matchAll(STATIC_ASSET_PATTERN)) {
        assetPaths.add(match[1]);
      }
    }),
  );

  await Promise.allSettled(
    [...assetPaths].map(async (path) => {
      if (await cache.match(path)) return;
      await cache.add(path);
    }),
  );
}
