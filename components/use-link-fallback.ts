"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Client-side navigation rides on a fetch with no deadline: on a one-bar
 * connection a tap can hang forever with nothing on screen. If the route has
 * not changed by this deadline, fall back to a full browser navigation,
 * which the service worker answers from the cached shell.
 */
const NAV_FALLBACK_MS = 3000;

/**
 * The tab bar's stuck-navigation insurance, shareable by any in-app link:
 * attach the returned handler to a Link's onClick with its href. Offline it
 * skips straight to the full navigation; online it arms a deadline that a
 * landed route change (pathname change) disarms.
 */
export function useLinkFallback(): (
  event: React.MouseEvent<HTMLAnchorElement>,
  href: string,
) => void {
  const pathname = usePathname() ?? "/";
  const timer = useRef<number | null>(null);

  // The pathname changing is the router saying the navigation landed; the
  // unmount cleanup covers a full page load replacing this tree.
  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [pathname]);

  return (event, href) => {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      href === pathname
    ) {
      return;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      event.preventDefault();
      window.location.assign(href);
      return;
    }

    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      window.location.assign(href);
    }, NAV_FALLBACK_MS);
  };
}
