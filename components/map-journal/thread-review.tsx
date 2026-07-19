"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { enrichPendingCaptures } from "@/lib/enrichment/client";
import type { EnrichmentSource, ThreadEnrichment } from "@/lib/enrichment/types";
import { readAvailableLocation } from "@/lib/local-capture/location";
import { getCaptureStore } from "@/lib/local-capture/store";
import type {
  CaptureSyncStatus,
  LocalCapture,
  LocalThread,
} from "@/lib/local-capture/types";
import type { MappableCapture } from "@/lib/map-journal/types";
import { synchronizePendingCaptures } from "@/lib/sync/client";
import { synchronizePendingMedia } from "@/lib/sync/media-client";

type ThreadReviewProps = {
  capture: MappableCapture;
  layout: "panel" | "sheet";
  online: boolean;
  onClose: () => void;
};

type TimelineEntry =
  | { kind: "capture"; at: string; capture: LocalCapture }
  | { kind: "enrichment"; at: string; enrichment: ThreadEnrichment };

function statusLabel(status: CaptureSyncStatus): string {
  switch (status) {
    case "saved_locally":
      return "Saved locally";
    case "syncing":
      return "Syncing";
    case "enriching":
      return "Enriching";
    case "complete":
      return "Complete";
    case "needs_attention":
      return "Needs attention";
  }
}

async function fetchThreadEnrichments(
  threadId: string,
): Promise<ThreadEnrichment[]> {
  try {
    const headers: Record<string, string> = {};
    const testUser = process.env.NEXT_PUBLIC_SYNC_TEST_USER_ID;
    if (testUser) headers["x-walking-thoughts-test-user"] = testUser;
    const response = await fetch(`/api/enrichment/threads/${threadId}`, {
      headers,
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { enrichments?: ThreadEnrichment[] };
    return body.enrichments ?? [];
  } catch {
    return [];
  }
}

export function ThreadReview({
  capture,
  layout,
  online,
  onClose,
}: ThreadReviewProps) {
  const [thread, setThread] = useState<LocalThread | null>(null);
  const [entries, setEntries] = useState<LocalCapture[]>([]);
  const [enrichments, setEnrichments] = useState<ThreadEnrichment[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function refreshThread() {
    const store = getCaptureStore();
    const view = await store.listThread(capture.threadId);
    const nextEnrichments = await fetchThreadEnrichments(capture.threadId);
    setThread(view.thread);
    setEntries(view.captures);
    setEnrichments(nextEnrichments);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const store = getCaptureStore();
      const view = await store.listThread(capture.threadId);
      const nextEnrichments = await fetchThreadEnrichments(capture.threadId);
      if (!active) return;
      setThread(view.thread);
      setEntries(view.captures);
      setEnrichments(nextEnrichments);
    })();
    return () => {
      active = false;
    };
  }, [capture.threadId, capture.id]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    const items: TimelineEntry[] = [
      ...entries.map((entry) => ({
        kind: "capture" as const,
        at: entry.createdAt,
        capture: entry,
      })),
      ...enrichments.map((enrichment) => ({
        kind: "enrichment" as const,
        at: enrichment.createdAt,
        enrichment,
      })),
    ];
    return items.sort(
      (a, b) => a.at.localeCompare(b.at) || a.kind.localeCompare(b.kind),
    );
  }, [entries, enrichments]);

  const selectedEntry =
    entries.find((entry) => entry.id === capture.id) ?? null;

  function commitFollowUp() {
    const text = draft.trim();
    if (!text) return;
    startTransition(async () => {
      try {
        const store = getCaptureStore();
        await store.commit(text, readAvailableLocation(), {
          destination: { type: "thread", threadId: capture.threadId },
        });
        setDraft("");
        setError(null);
        if (online) {
          try {
            await synchronizePendingMedia(store);
            await synchronizePendingCaptures(store);
            await enrichPendingCaptures(store, undefined, { retryFailed: true });
          } catch {
            // Local Capture is durable; sync/Enrichment can retry later.
          }
        }
        await refreshThread();
      } catch {
        setError("Could not save follow-up Capture locally");
      }
    });
  }

  return (
    <aside
      className={
        layout === "sheet" ? "map-journal-sheet" : "map-journal-panel"
      }
      aria-label="Thread review"
      data-layout={layout}
      data-testid="map-journal-thread-review"
    >
      <header className="map-journal-review-head">
        <div>
          <p className="map-journal-kicker">
            {statusLabel(capture.status)}
          </p>
          <h2>{thread?.title ?? "Thread"}</h2>
          <p className="map-journal-place">
            {capture.latitude.toFixed(4)}, {capture.longitude.toFixed(4)}
            {capture.accuracy > 100 ? " · low GPS accuracy" : ""}
          </p>
        </div>
        <button type="button" className="map-journal-close" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="map-journal-preview" role="status">
        <p className="map-journal-preview-label">Selected Capture</p>
        <p>{capture.text}</p>
        {selectedEntry && selectedEntry.attachments.length > 0 ? (
          <ul className="map-journal-attachments" aria-label="Attachments">
            {selectedEntry.attachments.map((attachment) => (
              <li key={attachment.id}>
                {attachment.kind}: {attachment.fileName}
              </li>
            ))}
          </ul>
        ) : capture.mediaKinds.length > 0 ? (
          <p className="map-journal-media-kinds">
            Media: {capture.mediaKinds.join(", ")}
          </p>
        ) : null}
        <p className="map-journal-entry-meta">{statusLabel(capture.status)}</p>
      </div>

      <ol className="map-journal-thread">
        {timeline.map((item) =>
          item.kind === "capture" ? (
            <li
              key={item.capture.id}
              className="map-journal-entry capture"
            >
              <p className="map-journal-entry-meta">
                Capture · {new Date(item.capture.createdAt).toLocaleString()} ·{" "}
                {statusLabel(item.capture.status)}
              </p>
              <p>{item.capture.text}</p>
              {item.capture.attachments.length > 0 ? (
                <ul className="map-journal-attachments" aria-label="Attachments">
                  {item.capture.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      {attachment.kind}: {attachment.fileName}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ) : (
            <li
              key={item.enrichment.id}
              className="map-journal-entry enrichment"
            >
              <p className="map-journal-entry-meta">
                Enrichment · {item.enrichment.model} ·{" "}
                {new Date(item.enrichment.createdAt).toLocaleString()}
              </p>
              <p>{item.enrichment.text}</p>
              {(item.enrichment.sources ?? []).length > 0 ? (
                <ul className="map-journal-sources">
                  {(item.enrichment.sources ?? []).map(
                    (source: EnrichmentSource) => (
                      <li key={`${item.enrichment.id}:${source.url}`}>
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.title || source.url}
                        </a>
                      </li>
                    ),
                  )}
                </ul>
              ) : null}
            </li>
          ),
        )}
      </ol>

      <div className="map-journal-followup">
        <label className="capture-field-label" htmlFor="map-journal-followup">
          Follow-up Capture
        </label>
        <textarea
          id="map-journal-followup"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          placeholder="Add to this Thread…"
        />
        <button
          type="button"
          onClick={commitFollowUp}
          disabled={isPending || draft.trim().length === 0}
        >
          Capture
        </button>
        <p className="map-journal-connectivity" role="note">
          {online
            ? "Follow-ups use the ordinary Capture sync and Enrichment path when online."
            : "Offline: follow-ups stay on this device until you reconnect."}
        </p>
        {error ? (
          <p className="capture-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
