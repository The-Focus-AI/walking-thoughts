export const SHELL_CACHE_NAME = "walking-thoughts-shell-v9";

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
}
