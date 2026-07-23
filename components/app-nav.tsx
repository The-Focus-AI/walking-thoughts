"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    href: "/threads",
    label: "Threads",
    isActive: (pathname) => pathname.startsWith("/threads"),
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M21 12a8 8 0 0 1-8 8H4l1.6-3.2A8 8 0 1 1 21 12Z" />
        <path d="M8.5 10.5h7M8.5 13.5h4.5" />
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
 * Persistent bottom tab bar — the single navigation surface shared by every
 * screen so Capture, Threads, and Map are always one thumb-tap away.
 */
export function AppNav() {
  const pathname = usePathname() ?? "/";

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
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
