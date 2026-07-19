import type { ReactNode } from "react";
import Link from "next/link";
import { AccountExport } from "@/components/account-export";
import { CaptureComposer } from "@/components/capture-composer";
import { DataHandlingDisclosure } from "@/components/data-handling-disclosure";
import { OfflineReadiness } from "@/components/offline-readiness";
import { TrailMapHero } from "@/components/trail-map-hero";

type AppShellProps = {
  account?: ReactNode;
  configurationRequired?: boolean;
};

/**
 * Trail home — Density A + Sync C + Map A fold from the trail-cleanup prototype.
 * Map hero first; sticky Capture dock + sync footer live in CaptureComposer.
 */
export function AppShell({ account, configurationRequired }: AppShellProps) {
  return (
    <main className="shell trail-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Walking Thoughts home">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <span>Walking Thoughts</span>
        </Link>
        <div className="topbar-actions">
          <Link className="topbar-link" href="/threads">
            Threads
          </Link>
          <Link className="topbar-link" href="/journal">
            Map Journal
          </Link>
          <OfflineReadiness />
          {account}
        </div>
      </header>

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
    </main>
  );
}
