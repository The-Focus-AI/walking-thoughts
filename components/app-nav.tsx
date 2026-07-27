"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type Tab = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
  icon: React.ReactNode;
};

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const TABS: Tab[] = [
  {
    href: "/",
    label: "Capture",
    isActive: (pathname) => pathname === "/" || pathname === "/offline",
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    href: "/days",
    label: "Days",
    isActive: (pathname) =>
      pathname.startsWith("/days") || pathname.startsWith("/threads"),
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3.5" y="5" width="17" height="15" rx="1.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    href: "/journal",
    label: "Map",
    isActive: (pathname) =>
      pathname.startsWith("/journal") || pathname.startsWith("/offline-maps"),
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
        <path d="M9 4v14M15 6v14" />
      </svg>
    ),
  },
  {
    href: "/interview",
    label: "You",
    isActive: (pathname) => pathname.startsWith("/interview"),
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    ),
  },
];

/**
 * Client-side navigation rides on a fetch with no deadline: on a one-bar
 * connection a tab tap can hang forever with nothing on screen. If the route
 * has not changed by this deadline, fall back to a full browser navigation,
 * which the service worker answers from the cached shell.
 */
const NAV_FALLBACK_MS = 3000;

/**
 * Persistent bottom tab bar — the single navigation surface shared by every
 * screen so Capture, Days, Map, and You are always one thumb-tap away.
 */
export function AppNav() {
  const pathname = usePathname() ?? "/";
  const fallbackTimer = useRef<number | null>(null);

  const clearFallback = () => {
    if (fallbackTimer.current !== null) {
      window.clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
  };

  // The pathname changing is the router saying the navigation landed; the
  // unmount cleanup covers a full page load replacing this tree.
  useEffect(() => {
    return () => {
      if (fallbackTimer.current !== null) {
        window.clearTimeout(fallbackTimer.current);
        fallbackTimer.current = null;
      }
    };
  }, [pathname]);

  function onTabClick(event: React.MouseEvent<HTMLAnchorElement>, tab: Tab) {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      tab.isActive(pathname)
    ) {
      return;
    }

    // Offline, the router's fetch can only fail — skip straight to the full
    // navigation the service worker can answer from cache.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      event.preventDefault();
      window.location.assign(tab.href);
      return;
    }

    clearFallback();
    fallbackTimer.current = window.setTimeout(() => {
      window.location.assign(tab.href);
    }, NAV_FALLBACK_MS);
  }

  return (
    <nav className="app-tabbar" aria-label="Primary" data-testid="app-tabbar">
      {TABS.map((tab) => {
        const active = tab.isActive(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? "app-tab app-tab-active" : "app-tab"}
            aria-current={active ? "page" : undefined}
            onClick={(event) => onTabClick(event, tab)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
