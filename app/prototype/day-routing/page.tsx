"use client";

/**
 * PROTOTYPE — day routing (end-of-walk dispatch), single flow.
 *
 * The question this settled: when filing's primary verb becomes "route
 * this somewhere," what shape makes the end-of-walk pass fast and obvious?
 * Earlier variants A–C and the first bookended cut live in git history on
 * this branch; VERDICT.md records the rounds.
 *
 * Run: pnpm dev → http://localhost:3000/prototype/day-routing
 */

import { RoutingFlow } from "./flow";
import "./prototype-route.css";

export default function DayRoutingPrototypePage() {
  return (
    <div
      className="proto-viewport-stage dr-stage viewport-desktop"
      data-viewport="desktop"
    >
      <div className="proto-viewport-chrome" aria-hidden="true">
        <span>Desktop · 1280×900</span>
        <span>day routing flow</span>
      </div>
      <div className="proto-viewport-frame">
        <RoutingFlow />
      </div>
    </div>
  );
}
