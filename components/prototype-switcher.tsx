"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type PrototypeOption = {
  key: string;
  label: string;
};

type PrototypeSwitcherProps = {
  /** URL search param key for the active variant (default `variant`). */
  param?: string;
  options: PrototypeOption[];
  /** Optional second dimension (e.g. area) — shown as tabs above the pill. */
  areaParam?: string;
  areas?: PrototypeOption[];
};

/**
 * PROTOTYPE ONLY — floating variant switcher.
 * Hidden in production builds.
 */
export function PrototypeSwitcher({
  param = "variant",
  options,
  areaParam,
  areas,
}: PrototypeSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isProd = process.env.NODE_ENV === "production";

  const currentKey = searchParams.get(param) ?? options[0]?.key ?? "A";
  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.key === currentKey),
  );
  const current = options[currentIndex] ?? options[0];
  const areaKey = areaParam
    ? (searchParams.get(areaParam) ?? areas?.[0]?.key)
    : null;
  const currentArea = areas?.find((area) => area.key === areaKey) ?? areas?.[0];

  function replaceParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function cycle(delta: number) {
    if (options.length === 0) return;
    const next =
      options[(currentIndex + delta + options.length) % options.length];
    if (next) replaceParams({ [param]: next.key });
  }

  function setArea(key: string) {
    if (!areaParam) return;
    const first = options[0]?.key ?? "A";
    replaceParams({ [areaParam]: key, [param]: first });
  }

  useEffect(() => {
    if (isProd) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        cycle(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        cycle(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prototype: cycle closes over latest index
  }, [currentIndex, isProd, options.length]);

  if (isProd) return null;

  return (
    <div className="proto-switcher" data-testid="prototype-switcher">
      {areas && areaParam ? (
        <div
          className="proto-switcher-areas"
          role="tablist"
          aria-label="Prototype area"
        >
          {areas.map((area) => (
            <button
              key={area.key}
              type="button"
              role="tab"
              aria-selected={area.key === currentArea?.key}
              className={
                area.key === currentArea?.key
                  ? "proto-switcher-area active"
                  : "proto-switcher-area"
              }
              onClick={() => setArea(area.key)}
            >
              {area.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="proto-switcher-pill">
        <button
          type="button"
          className="proto-switcher-arrow"
          aria-label="Previous variant"
          onClick={() => cycle(-1)}
        >
          ←
        </button>
        <span className="proto-switcher-label">
          {currentArea ? `${currentArea.label} · ` : ""}
          {current?.key} — {current?.label}
        </span>
        <button
          type="button"
          className="proto-switcher-arrow"
          aria-label="Next variant"
          onClick={() => cycle(1)}
        >
          →
        </button>
      </div>
    </div>
  );
}
