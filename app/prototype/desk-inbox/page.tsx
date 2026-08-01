"use client";

/**
 * PROTOTYPE — throwaway UI exploration for desktop processing (the desk inbox).
 *
 * Question: Back at the desk, what makes getting through unreviewed Threads
 * fast — marking notes processed while keeping useful research, seeing what
 * media is stored, and seeing similar past Threads while filing?
 *
 * Run: pnpm dev → http://127.0.0.1:3000/prototype
 * Params: ?variant=A|B|C (desktop-only surface)
 */

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { DESK_VARIANTS, DeskA, DeskB, DeskC } from "./variants";
import "./prototype-desk.css";

function DeskInboxPrototype() {
  const searchParams = useSearchParams();
  const variant = (searchParams.get("variant") ?? "A").toUpperCase();

  let body: ReactNode;
  if (variant === "B") body = <DeskB />;
  else if (variant === "C") body = <DeskC />;
  else body = <DeskA />;

  return (
    <div className="proto-viewport-stage di-stage viewport-desktop" data-viewport="desktop">
      <div className="proto-viewport-chrome" aria-hidden="true">
        <span>Desktop · 1280×900</span>
        <span>process · {variant}</span>
      </div>
      <div className="proto-viewport-frame">{body}</div>
      <PrototypeSwitcher param="variant" options={[...DESK_VARIANTS]} />
    </div>
  );
}

export default function DeskInboxPrototypePage() {
  return (
    <Suspense fallback={<p className="proto-pad">Loading prototype…</p>}>
      <DeskInboxPrototype />
    </Suspense>
  );
}
