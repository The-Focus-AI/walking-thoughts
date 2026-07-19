import type { ReactNode } from "react";
import Link from "next/link";
import { MapJournal } from "@/components/map-journal/map-journal";
import { OfflineReadiness } from "@/components/offline-readiness";

type AppShellProps = {
  account?: ReactNode;
  configurationRequired?: boolean;
};

export function AppShell({ account, configurationRequired }: AppShellProps) {
  return (
    <main className="shell shell-journal">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Walking Thoughts home">
          <span className="brand-mark" aria-hidden="true">
            W
          </span>
          <span>Walking Thoughts</span>
        </Link>
        <div className="topbar-actions">
          <OfflineReadiness />
          {account}
        </div>
      </header>

      {configurationRequired ? (
        <section className="hero">
          <p className="eyebrow">Built for the trail beyond the signal</p>
          <h1>Capture what matters out there.</h1>
          <aside className="configuration-note" role="status">
            <strong>Secure setup required</strong>
            <span>
              Clerk keys and the allowed user must be configured before private
              Captures can begin.
            </span>
          </aside>
        </section>
      ) : (
        <MapJournal />
      )}

      <footer>
        <span>Local first</span>
        <span aria-hidden="true">·</span>
        <span>Private by default</span>
      </footer>
    </main>
  );
}
