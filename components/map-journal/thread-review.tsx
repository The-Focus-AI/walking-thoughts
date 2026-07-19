"use client";

import { useEffect, useState, useTransition } from "react";
import { getCaptureStore } from "@/lib/local-capture/store";
import type {
  LocalCapture,
  LocalThread,
} from "@/lib/local-capture/types";
import type { EnrichmentSource, ThreadEnrichment } from "@/lib/enrichment/types";
import type { MappableCapture } from "@/lib/map-journal/types";

type ThreadReviewProps = {
  capture: MappableCapture;
  layout: "panel" | "sheet";
  online: boolean;
  onClose: () => void;
};

async function fetchThreadEnrichments(
  threadId: string,
): Promise<ThreadEnrichment[]> {
  try {
    const response = await fetch(`/api/enrichment/threads/${threadId}`);
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

  function commitFollowUp() {
    const text = draft.trim();
    if (!text) return;
    startTransition(async () => {
      try {
        const store = getCaptureStore();
        await store.commit(text, null, {
          destination: { type: "thread", threadId: capture.threadId },
        });
        setDraft("");
        const view = await store.listThread(capture.threadId);
        setEntries(view.captures);
        setThread(view.thread);
        setError(null);
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
          <p className="map-journal-kicker">{capture.status.replaceAll("_", " ")}</p>
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
        {capture.mediaKinds.length > 0 ? (
          <p className="map-journal-media-kinds">
            Media: {capture.mediaKinds.join(", ")}
          </p>
        ) : null}
      </div>

      <ol className="map-journal-thread">
        {entries.map((entry) => (
          <li key={entry.id} className="map-journal-entry capture">
            <p className="map-journal-entry-meta">
              Capture · {new Date(entry.createdAt).toLocaleString()} ·{" "}
              {entry.status.replaceAll("_", " ")}
            </p>
            <p>{entry.text}</p>
          </li>
        ))}
        {enrichments.map((enrichment) => (
          <li key={enrichment.id} className="map-journal-entry enrichment">
            <p className="map-journal-entry-meta">
              Enrichment · {enrichment.model}
            </p>
            <p>{enrichment.text}</p>
            {(enrichment.sources ?? []).length > 0 ? (
              <ul className="map-journal-sources">
                {(enrichment.sources ?? []).map((source: EnrichmentSource) => (
                  <li key={`${enrichment.id}:${source.url}`}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title || source.url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
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
            ? "Follow-ups sync and Enrich when online."
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
