import type { ReactNode } from "react";
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { CaptureComposer } from "@/components/capture-composer";
import { OfflineReadiness } from "@/components/offline-readiness";
import { InstrumentStrip, SheetMasthead } from "@/components/sheet";
import { SyncRuntime } from "@/components/sync-runtime";
import { TrailMapHero } from "@/components/trail-map-hero";

type AppShellProps = {
  account?: ReactNode;
  configurationRequired?: boolean;
};

/**
 * The trail surface: where you are, and what you want to say about it.
 * Nothing else — the day's Threads, the reports, the account desk all live
 * one tap away on Days and You, so this screen stays a field instrument.
 * Screen-to-screen navigation is the shared bottom tab bar (AppNav).
 */
export function AppShell({ account, configurationRequired }: AppShellProps) {
  return (
    <main className="shell trail-shell sheet">
      {!configurationRequired ? <SyncRuntime /> : null}
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Walking Thoughts home">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
        </Link>
        <div className="topbar-actions">
          <OfflineReadiness />
          {account}
        </div>
      </header>

      <SheetMasthead />
      <InstrumentStrip />

      <div className="trail-layout">
        <TrailMapHero />

        {configurationRequired ? (
          <aside className="configuration-note" role="status">
            <strong>Secure setup required</strong>
            <span>
              Clerk keys and the allowed user must be configured before private
              Captures can begin.
            </span>
          </aside>
        ) : (
          <CaptureComposer />
        )}
      </div>

      <AppNav />
    </main>
  );
}
