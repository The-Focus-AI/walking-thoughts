"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getDestinationSession } from "@/lib/local-capture/destination";
import {
  prefetchLocation,
  readAvailableLocation,
} from "@/lib/local-capture/location";
import {
  persistenceLabel,
  requestPersistentStorage,
} from "@/lib/local-capture/persistence";
import { getCaptureStore } from "@/lib/local-capture/store";
import type {
  CaptureSyncStatus,
  LocalCapture,
  LocalThread,
  PersistenceResult,
  ThreadDestination,
} from "@/lib/local-capture/types";
import { synchronizePendingCaptures } from "@/lib/sync/client";

function destinationValue(destination: ThreadDestination): string {
  if (destination.type === "thread") return destination.threadId;
  return destination.type;
}

function destinationFromValue(value: string): ThreadDestination {
  if (value === "inbox") return { type: "inbox" };
  if (value === "new_thread") return { type: "new_thread" };
  return { type: "thread", threadId: value };
}

function statusLabel(status: CaptureSyncStatus): string {
  switch (status) {
    case "saved_locally":
      return "Saved locally";
    case "syncing":
      return "Syncing";
    case "complete":
      return "Complete";
    case "needs_attention":
      return "Needs attention";
  }
}

type ThreadView = {
  thread: LocalThread;
  captures: LocalCapture[];
};

export function CaptureComposer() {
  const [draft, setDraft] = useState("");
  const [inbox, setInbox] = useState<LocalCapture[]>([]);
  const [threads, setThreads] = useState<ThreadView[]>([]);
  const [recentThreads, setRecentThreads] = useState<LocalThread[]>([]);
  const [destination, setDestinationState] = useState<ThreadDestination>({
    type: "inbox",
  });
  const [error, setError] = useState<string | null>(null);
  const [persistence, setPersistence] = useState<PersistenceResult | null>(null);
  const [ready, setReady] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const draftSaveGeneration = useRef(0);
  const syncGeneration = useRef(0);

  async function refreshLists() {
    const store = getCaptureStore();
    const [nextInbox, recent] = await Promise.all([
      store.listInbox(),
      store.listRecentThreads(),
    ]);
    const threadViews = await Promise.all(
      recent.map(async (thread) => store.listThread(thread.id)),
    );
    setInbox(nextInbox);
    setRecentThreads(recent);
    setThreads(threadViews);
  }

  async function runForegroundSync() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const generation = ++syncGeneration.current;
    setIsSyncing(true);
    try {
      await synchronizePendingCaptures(getCaptureStore());
      if (generation === syncGeneration.current) {
        await refreshLists();
      }
    } catch {
      if (generation === syncGeneration.current) {
        setError("Synchronization needs attention");
      }
    } finally {
      if (generation === syncGeneration.current) {
        setIsSyncing(false);
      }
    }
  }

  useEffect(() => {
    let active = true;
    prefetchLocation();
    const session = getDestinationSession();

    (async () => {
      const store = getCaptureStore();
      const savedDraft = await store.getDraft();
      if (!active) return;
      setDraft(savedDraft);
      setDestinationState(session.get());
      await refreshLists();
      if (active) setReady(true);
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
    if (!ready) return;
    const start = window.setTimeout(() => {
      void runForegroundSync();
    }, 0);
    const onOnline = () => {
      void runForegroundSync();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(start);
      window.removeEventListener("online", onOnline);
    };
    // Foreground sync should arm once the composer is ready and on reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runForegroundSync closes over latest store helpers
  }, [ready]);

  useEffect(() => {
    if (!ready || isPending) return;

    const generation = ++draftSaveGeneration.current;
    const handle = window.setTimeout(() => {
      if (generation !== draftSaveGeneration.current) return;
      const session = getDestinationSession();
      session.touch();
      setDestinationState(session.get());
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

  function onDestinationChange(value: string) {
    const next = destinationFromValue(value);
    getDestinationSession().set(next);
    setDestinationState(getDestinationSession().get());
  }

  function syncDestinationFromSession() {
    setDestinationState(getDestinationSession().get());
  }

  function commit() {
    const text = draft.trim();
    const draftSnapshot = draft;
    if (!text || isPending) return;

    setError(null);
    draftSaveGeneration.current += 1;
    syncDestinationFromSession();
    startTransition(async () => {
      const store = getCaptureStore();
      const session = getDestinationSession();
      try {
        const location = readAvailableLocation();
        const capture = await store.commit(text, location, {
          destination: session.get(),
        });
        session.rememberCommit(capture);
        setDestinationState(session.get());
      } catch {
        setError("Could not save Capture");
        const preserved = await store.getDraft().catch(() => draftSnapshot);
        setDraft(preserved || draftSnapshot);
        return;
      }

      setDraft("");
      try {
        await refreshLists();
      } catch {
        // The Capture is already durable; listing can recover on the next load.
      }

      try {
        setPersistence(await requestPersistentStorage());
      } catch {
        setPersistence("not_persisted");
      }

      void runForegroundSync();
    });
  }

  return (
    <div className="capture-workspace">
      <div className="capture-card" aria-label="New Capture">
        <div className="capture-composer">
          <span className="capture-label">New Capture</span>
          <label className="capture-field-label" htmlFor="capture-destination">
            Destination
          </label>
          <select
            id="capture-destination"
            value={destinationValue(destination)}
            onChange={(event) => onDestinationChange(event.target.value)}
            onFocus={syncDestinationFromSession}
            disabled={!ready || isPending}
          >
            <option value="inbox">Inbox</option>
            <option value="new_thread">New Thread</option>
            {recentThreads.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {thread.title}
              </option>
            ))}
          </select>
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

      <div className="capture-sync-bar">
        <p className="capture-persistence" role="status">
          {isSyncing
            ? "Foreground sync running…"
            : "Foreground sync when open and online (background is best effort)"}
        </p>
        <button
          type="button"
          className="capture-retry"
          onClick={() => void runForegroundSync()}
          disabled={!ready || isSyncing}
        >
          Retry sync
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

      {inbox.length > 0 ? (
        <section className="capture-section" aria-label="Inbox">
          <h2 className="capture-section-title">Inbox</h2>
          <ul className="capture-list">
            {inbox.map((capture) => (
              <li key={capture.id}>
                <CaptureEntry capture={capture} onRetry={() => void runForegroundSync()} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {threads.map(({ thread, captures }) => (
        <section
          key={thread.id}
          className="capture-section"
          aria-label={thread.title}
        >
          <div className="capture-section-header">
            <h2 className="capture-section-title">{thread.title}</h2>
            <span className="capture-revision">Revision {thread.revision}</span>
          </div>
          <ul className="capture-list">
            {captures.map((capture) => (
              <li key={capture.id}>
                <CaptureEntry capture={capture} onRetry={() => void runForegroundSync()} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CaptureEntry({
  capture,
  onRetry,
}: {
  capture: LocalCapture;
  onRetry: () => void;
}) {
  return (
    <article className="capture-entry" aria-label={capture.text}>
      <div className="capture-entry-meta">
        <span className={`capture-status status-${capture.status}`}>
          {statusLabel(capture.status)}
        </span>
        <span className="capture-sequence">#{capture.sequence}</span>
        <time dateTime={capture.createdAt}>
          {new Date(capture.createdAt).toLocaleString()}
        </time>
      </div>
      <p>{capture.text}</p>
      {capture.status === "needs_attention" ? (
        <div className="capture-attention">
          <span>{capture.syncReason ?? "Synchronization failed"}</span>
          {capture.syncRetryable !== false ? (
            <button type="button" className="capture-retry" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
