import type { ReactNode } from "react";
import Link from "next/link";
import { CaptureComposer } from "@/components/capture-composer";
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
          <Link className="topbar-link" href="/journal">
            Map Journal
          </Link>
          <OfflineReadiness />
          {account}
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">Built for the trail beyond the signal</p>
        <h1>Capture what matters out there.</h1>
        <p className="lede">
          Save observations on your phone first. Walking Thoughts will be ready
          to add context when you reconnect.
        </p>
        <p className="hero-review">
          <Link className="hero-review-link" href="/journal">
            Review your walks on the Map Journal →
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

      <footer>
        <span>Local first</span>
        <span aria-hidden="true">·</span>
        <span>Private by default</span>
        <span aria-hidden="true">·</span>
        <Link className="footer-link" href="/privacy">
          Privacy &amp; data handling
        </Link>
      </footer>
    </main>
  );
}
