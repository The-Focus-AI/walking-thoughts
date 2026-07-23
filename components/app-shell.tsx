import type { ReactNode } from "react";
import Link from "next/link";
import { AccountExport } from "@/components/account-export";
import { AppNav } from "@/components/app-nav";
import { CaptureComposer } from "@/components/capture-composer";
import { DataHandlingDisclosure } from "@/components/data-handling-disclosure";
import { OfflineReadiness } from "@/components/offline-readiness";
import { InstrumentStrip, SheetMasthead } from "@/components/sheet";
import { SyncRuntime } from "@/components/sync-runtime";
import { TrailMapHero } from "@/components/trail-map-hero";

type AppShellProps = {
  account?: ReactNode;
  configurationRequired?: boolean;
};

/**
 * Trail home — Capture front and center. Screen-to-screen navigation lives in
 * the shared bottom tab bar (AppNav); the topbar stays glanceable.
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

        <section className="trail-capture" aria-label="On the trail">
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
        </section>
      </div>

      <details className="trail-account">
        <summary>Account &amp; data handling</summary>
        {!configurationRequired ? <AccountExport /> : null}
        <DataHandlingDisclosure />
      </details>

      <footer>
        <span>Local first</span>
        <span aria-hidden="true">·</span>
        <span>Private cloud media · no end-to-end encryption claim</span>
      </footer>

      <AppNav />
    </main>
  );
}
