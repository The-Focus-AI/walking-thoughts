import type { ReactNode } from "react";
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { CaptureComposer } from "@/components/capture-composer";
import { OfflineReadiness } from "@/components/offline-readiness";
import { SyncRuntime } from "@/components/sync-runtime";

type AppShellProps = {
  account?: ReactNode;
  configurationRequired?: boolean;
};

/**
 * The trail surface has one job: record the thought — text, photo, video, or
 * audio. Everything else (the day's Threads, the maps, the reports, the
 * account desk) lives one tap away on the bottom tab bar, so this screen
 * stays a field instrument with nothing around the composer.
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
          <h1 className="trail-title">Trail Log</h1>
        </Link>
        <div className="topbar-actions">
          <OfflineReadiness />
          {account}
        </div>
      </header>

      <div className="trail-layout">
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
