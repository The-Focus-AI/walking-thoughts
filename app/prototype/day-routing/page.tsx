"use client";

/**
 * PROTOTYPE — throwaway UI exploration for day routing (end-of-walk dispatch).
 *
 * Question: When filing's primary verb becomes "route this somewhere" —
 * Spec / To-do / Journal / Timeline / Drop — what shape makes the
 * end-of-walk pass through the Day fast and obvious?
 *
 * Run: pnpm dev → http://127.0.0.1:3000/prototype
 * Params: ?variant=A|B|C (desktop-only surface)
 */

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { DeckVariant } from "./deck-variant";
import { LanesVariant } from "./lanes-variant";
import { WrapVariant } from "./wrap-variant";
import "./prototype-route.css";

const VARIANTS = [
  { key: "A", label: "Dispatch deck" },
  { key: "B", label: "Sorting lanes" },
  { key: "C", label: "Day wrap sheet" },
];

function DayRoutingPrototype() {
  const searchParams = useSearchParams();
  const variant = (searchParams.get("variant") ?? "A").toUpperCase();

  let body: ReactNode;
  if (variant === "B") body = <LanesVariant />;
  else if (variant === "C") body = <WrapVariant />;
  else body = <DeckVariant />;

  return (
    <div
      className="proto-viewport-stage dr-stage viewport-desktop"
      data-viewport="desktop"
    >
      <div className="proto-viewport-chrome" aria-hidden="true">
        <span>Desktop · 1280×900</span>
        <span>route · {variant}</span>
      </div>
      <div className="proto-viewport-frame">{body}</div>
      <PrototypeSwitcher param="variant" options={VARIANTS} />
    </div>
  );
}

export default function DayRoutingPrototypePage() {
  return (
    <Suspense fallback={<p className="proto-pad">Loading prototype…</p>}>
      <DayRoutingPrototype />
    </Suspense>
  );
}
