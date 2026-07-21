"use client";

/**
 * PROTOTYPE — throwaway UI exploration for the Thread review page.
 *
 * Question: After the walk, what makes the Thread page good for going back
 * over notes and photos — seeing what I wrote, what came back from research,
 * and what the follow-ups are?
 *
 * Run: pnpm dev → http://127.0.0.1:3000/prototype
 * Params: ?viewport=mobile|desktop&area=review|enrich&variant=A|B|C
 */

import { Suspense, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { ENRICH_VARIANTS, EnrichA, EnrichB, EnrichC } from "./enrich-variants";
import { REVIEW_VARIANTS, ReviewA, ReviewB, ReviewC } from "./review-variants";
import "./prototype-thread.css";

const AREAS = [
  { key: "review", label: "Review" },
  { key: "enrich", label: "Enrich" },
] as const;

const VIEWPORTS = [
  { key: "mobile", label: "Mobile" },
  { key: "desktop", label: "Desktop" },
] as const;

type AreaKey = (typeof AREAS)[number]["key"];
type ViewportKey = (typeof VIEWPORTS)[number]["key"];

function ThreadReviewPrototype() {
  const searchParams = useSearchParams();
  const area = (searchParams.get("area") ?? "review") as AreaKey;
  const variant = (searchParams.get("variant") ?? "A").toUpperCase();
  const viewport = (
    searchParams.get("viewport") === "desktop" ? "desktop" : "mobile"
  ) as ViewportKey;

  const options = area === "enrich" ? [...ENRICH_VARIANTS] : [...REVIEW_VARIANTS];

  let body: ReactNode = null;
  if (area === "enrich") {
    body =
      variant === "B" ? <EnrichB /> : variant === "C" ? <EnrichC /> : <EnrichA />;
  } else {
    body =
      variant === "B" ? <ReviewB /> : variant === "C" ? <ReviewC /> : <ReviewA />;
  }

  return (
    <div
      className={`proto-viewport-stage tr-stage viewport-${viewport}`}
      data-viewport={viewport}
    >
      <div className="proto-viewport-chrome" aria-hidden="true">
        <span>{viewport === "mobile" ? "Pixel · 390×844" : "Desktop · 1280×900"}</span>
        <span>
          {area} · {variant}
        </span>
      </div>
      <div className="proto-viewport-frame">{body}</div>
      <PrototypeSwitcher
        areaParam="area"
        areas={[...AREAS]}
        viewportParam="viewport"
        viewports={[...VIEWPORTS]}
        param="variant"
        options={options}
      />
    </div>
  );
}

export default function ThreadReviewPrototypePage() {
  return (
    <Suspense fallback={<p className="proto-pad">Loading prototype…</p>}>
      <ThreadReviewPrototype />
    </Suspense>
  );
}
