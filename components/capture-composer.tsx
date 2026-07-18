"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  prefetchLocation,
  readAvailableLocation,
} from "@/lib/local-capture/location";
import {
  persistenceLabel,
  requestPersistentStorage,
} from "@/lib/local-capture/persistence";
import { getCaptureStore } from "@/lib/local-capture/store";
import type { LocalCapture, PersistenceResult } from "@/lib/local-capture/types";

export function CaptureComposer() {
  const [draft, setDraft] = useState("");
  const [captures, setCaptures] = useState<LocalCapture[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [persistence, setPersistence] = useState<PersistenceResult | null>(null);
  const [ready, setReady] = useState(false);
  const [isPending, startTransition] = useTransition();
  const draftSaveGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    prefetchLocation();

    (async () => {
      const store = getCaptureStore();
      const [savedDraft, savedCaptures] = await Promise.all([
        store.getDraft(),
        store.list(),
      ]);
      if (!active) return;
      setDraft(savedDraft);
      setCaptures(savedCaptures);
      setReady(true);
    })().catch(() => {
      if (active) {
        setError("Could not open local Capture storage");
        setReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || isPending) return;

    const generation = ++draftSaveGeneration.current;
    const handle = window.setTimeout(() => {
      if (generation !== draftSaveGeneration.current) return;
      getCaptureStore()
        .setDraft(draft)
        .catch(() => {
          if (generation === draftSaveGeneration.current) {
            setError("Could not save draft");
          }
        });
    }, 50);

    return () => window.clearTimeout(handle);
  }, [draft, ready, isPending]);

  function commit() {
    const text = draft.trim();
    const draftSnapshot = draft;
    if (!text || isPending) return;

    setError(null);
    draftSaveGeneration.current += 1;
    startTransition(async () => {
      const store = getCaptureStore();
      try {
        const location = readAvailableLocation();
        await store.commit(text, location);
      } catch {
        setError("Could not save Capture");
        const preserved = await store.getDraft().catch(() => draftSnapshot);
        setDraft(preserved || draftSnapshot);
        return;
      }

      setDraft("");
      try {
        setCaptures(await store.list());
      } catch {
        // The Capture is already durable; listing can recover on the next load.
      }

      try {
        setPersistence(await requestPersistentStorage());
      } catch {
        setPersistence("not_persisted");
      }
    });
  }

  return (
    <div className="capture-workspace">
      <div className="capture-card" aria-label="New Capture">
        <div className="capture-composer">
          <span className="capture-label">New Capture</span>
          <label className="capture-field-label" htmlFor="capture-text">
            Capture text
          </label>
          <textarea
            id="capture-text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What did you notice?"
            rows={4}
            disabled={!ready || isPending}
          />
        </div>
        <button
          type="button"
          onClick={commit}
          disabled={!ready || isPending || draft.trim().length === 0}
        >
          Capture
        </button>
      </div>

      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}

      {persistence ? (
        <p className="capture-persistence" role="status">
          {persistenceLabel(persistence)}
        </p>
      ) : null}

      {captures.length > 0 ? (
        <ul className="capture-list">
          {captures.map((capture) => (
            <li key={capture.id}>
              <article className="capture-entry" aria-label={capture.text}>
                <div className="capture-entry-meta">
                  <span className="capture-status">Saved locally</span>
                  <time dateTime={capture.createdAt}>
                    {new Date(capture.createdAt).toLocaleString()}
                  </time>
                </div>
                <p>{capture.text}</p>
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
