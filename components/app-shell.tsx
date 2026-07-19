import type { ReactNode } from "react";
import Link from "next/link";
import { AccountExport } from "@/components/account-export";
import { CaptureComposer } from "@/components/capture-composer";
import { DataHandlingDisclosure } from "@/components/data-handling-disclosure";
import { OfflineReadiness } from "@/components/offline-readiness";
import { OfflineRegionPanel } from "@/components/offline-region-panel";

type AppShellProps = {
  account?: ReactNode;
  configurationRequired?: boolean;
};

export function AppShell({ account, configurationRequired }: AppShellProps) {
  return (
    <main className="shell">
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

      <section className="hero hero-trail">
        <p className="eyebrow">On the trail</p>
        <h1>Walking Thoughts</h1>
        <p className="lede">
          Append to today&apos;s Thread as you walk. Replies show up in the same
          stream after sync.
        </p>
        <p className="hero-review">
          <Link className="hero-review-link" href="/threads">
            Browse Threads by day →
          </Link>
        </p>

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

      <OfflineRegionPanel />
      {!configurationRequired ? <AccountExport /> : null}

      <DataHandlingDisclosure />

      <footer>
        <span>Local first</span>
        <span aria-hidden="true">·</span>
        <span>Private cloud media · no end-to-end encryption claim</span>
      </footer>
    </main>
  );
}
