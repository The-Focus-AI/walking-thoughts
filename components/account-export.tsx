"use client";

import { useState, useTransition } from "react";

export function AccountExport() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function download() {
    startTransition(() => {
      void (async () => {
        setError(null);
        try {
          const response = await fetch("/api/export", {
            method: "GET",
            credentials: "same-origin",
          });
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            throw new Error(body?.error ?? `export_failed_${response.status}`);
          }

          const blob = await response.blob();
          const disposition = response.headers.get("content-disposition") ?? "";
          const match = /filename="([^"]+)"/.exec(disposition);
          const filename = match?.[1] ?? "walking-thoughts-export.zip";
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = filename;
          anchor.click();
          URL.revokeObjectURL(url);
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "export_failed",
          );
        }
      })();
    });
  }

  return (
    <section className="account-export" aria-label="Account export">
      <header className="account-export-header">
        <h2>Export account</h2>
        <p>
          Download every active Thread as readable Markdown plus complete JSON
          history with Enrichment sources and original synchronized media.
        </p>
      </header>
      <div className="account-export-actions">
        <button type="button" disabled={isPending} onClick={download}>
          {isPending ? "Preparing export…" : "Download export"}
        </button>
      </div>
      {error ? (
        <p className="account-export-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
