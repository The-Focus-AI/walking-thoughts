"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  OutdoorCaptureDock,
  type CaptureMode,
} from "@/components/outdoor-capture-dock";
import { getDestinationSession } from "@/lib/local-capture/destination";
import {
  prefetchLocation,
  readAvailableLocation,
} from "@/lib/local-capture/location";
import {
  persistenceLabel,
  requestPersistentStorage,
} from "@/lib/local-capture/persistence";
import {
  AUDIO_LIMIT_MS,
  VIDEO_LIMIT_MS,
  createRecorder,
} from "@/lib/local-capture/recording";
import {
  canOfferLocalRemoval,
  mediaAvailability,
  mediaAvailabilityLabel,
  removeLocalOriginal,
  restoreLocalOriginal,
} from "@/lib/local-capture/local-media-retention";
import { createIdbMediaStore } from "@/lib/local-capture/media-store";
import { getCaptureStore } from "@/lib/local-capture/store";
import type {
  AttachmentInput,
  LocalAttachment,
  LocalCapture,
  LocalThread,
  MediaKind,
  PersistenceResult,
  ThreadDestination,
} from "@/lib/local-capture/types";
import { EnrichmentEntryView, statusLabel } from "@/components/thread-entries";
import { enrichPendingCaptures } from "@/lib/enrichment/client";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import { synchronizePendingCaptures } from "@/lib/sync/client";
import {
  getMediaTransport,
  synchronizePendingMedia,
} from "@/lib/sync/media-client";

function destinationValue(destination: ThreadDestination): string {
  if (destination.type === "thread") return destination.threadId;
  return destination.type;
}

function destinationFromValue(value: string): ThreadDestination {
  if (value === "inbox") return { type: "inbox" };
  if (value === "new_thread") return { type: "new_thread" };
  return { type: "thread", threadId: value };
}

type ThreadView = {
  thread: LocalThread;
  captures: LocalCapture[];
  enrichments: ThreadEnrichment[];
};

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
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentInput[]>(
    [],
  );
  const [mode, setMode] = useState<CaptureMode>("type");
  const [recordingLabel, setRecordingLabel] = useState<string | null>(null);
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const draftSaveGeneration = useRef(0);
  const syncGeneration = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const recordAbortRef = useRef<AbortController | null>(null);

  async function refreshLists() {
    const store = getCaptureStore();
    const [nextInbox, recent] = await Promise.all([
      store.listInbox(),
      store.listRecentThreads(),
    ]);
    const threadViews = await Promise.all(
      recent.map(async (thread) => {
        const view = await store.listThread(thread.id);
        const enrichments = await fetchThreadEnrichments(thread.id);
        return { ...view, enrichments };
      }),
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
      await synchronizePendingMedia(getCaptureStore());
      await synchronizePendingCaptures(getCaptureStore());
      await enrichPendingCaptures(getCaptureStore(), undefined, {
        retryFailed: true,
      });
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

  async function onRemoveLocalMedia(
    captureId: string,
    attachmentId: string,
  ) {
    const transport = getMediaTransport();
    if (!transport.verify || !transport.download) {
      setError("Media verification is unavailable");
      return;
    }
    try {
      await removeLocalOriginal({
        store: getCaptureStore(),
        mediaStore: createIdbMediaStore(),
        captureId,
        attachmentId,
        remote: {
          verify: (id) => transport.verify!(id),
          download: (id) => transport.download!(id),
        },
      });
      await refreshLists();
    } catch {
      setError("Could not remove local media until the server copy is verified");
    }
  }

  async function onRestoreLocalMedia(
    captureId: string,
    attachmentId: string,
  ) {
    const transport = getMediaTransport();
    if (!transport.download) {
      setError("Media download is unavailable");
      return;
    }
    try {
      await restoreLocalOriginal({
        store: getCaptureStore(),
        mediaStore: createIdbMediaStore(),
        captureId,
        attachmentId,
        remote: {
          verify: async (id) =>
            transport.verify ? transport.verify(id) : true,
          download: (id) => transport.download!(id),
        },
      });
      await refreshLists();
    } catch {
      setError("Could not restore media from the private server copy");
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
      setOnline(true);
      void runForegroundSync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearTimeout(start);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
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

  function kindFromMime(mimeType: string): MediaKind {
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";
    return "image";
  }

  async function onFilesSelected(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next: AttachmentInput[] = [];
    for (const file of Array.from(fileList)) {
      next.push({
        kind: kindFromMime(file.type || "application/octet-stream"),
        mimeType: file.type || "application/octet-stream",
        fileName: file.name || "attachment",
        bytes: file,
      });
    }
    setPendingAttachments((current) => [...current, ...next]);
  }

  function commitWithAttachments(
    text: string,
    attachmentsSnapshot: AttachmentInput[],
  ) {
    const draftSnapshot = draft;
    if ((!text && attachmentsSnapshot.length === 0) || isPending) return;

    setError(null);
    setSaveConfirmation(null);
    draftSaveGeneration.current += 1;
    syncDestinationFromSession();
    startTransition(async () => {
      const store = getCaptureStore();
      const session = getDestinationSession();
      try {
        const location = readAvailableLocation();
        const capture = await store.commit(text, location, {
          destination: session.get(),
          attachments: attachmentsSnapshot,
        });
        session.rememberCommit(capture);
        setDestinationState(session.get());
        setSaveConfirmation("Saved locally");
      } catch {
        setError("Could not save Capture");
        const preserved = await store.getDraft().catch(() => draftSnapshot);
        setDraft(preserved || draftSnapshot);
        setPendingAttachments(attachmentsSnapshot);
        return;
      }

      setDraft("");
      setPendingAttachments([]);
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

  function commit() {
    commitWithAttachments(draft.trim(), pendingAttachments);
  }

  async function commitRecording(kind: "audio" | "video") {
    setError(null);
    setRecordingLabel(kind === "audio" ? "Recording audio…" : "Recording video…");
    const controller = new AbortController();
    recordAbortRef.current = controller;
    try {
      const result = await createRecorder().record(kind, {
        signal: controller.signal,
        maxMs: kind === "audio" ? AUDIO_LIMIT_MS : VIDEO_LIMIT_MS,
      });
      if (result.bytes.size === 0) {
        setRecordingLabel(null);
        return;
      }
      if (result.hitLimit) {
        setRecordingLabel(
          kind === "audio"
            ? "Audio hit the 10-minute limit"
            : "Video hit the 2-minute limit",
        );
      } else {
        setRecordingLabel(null);
      }
      commitWithAttachments("", [
        {
          kind: result.kind,
          mimeType: result.mimeType,
          fileName: result.fileName,
          bytes: result.bytes,
        },
      ]);
    } catch {
      setError(`Could not record ${kind}`);
      setRecordingLabel(null);
    } finally {
      recordAbortRef.current = null;
    }
  }

  function onModeChange(next: CaptureMode) {
    setMode(next);
    if (next === "photo") {
      cameraInputRef.current?.click();
    }
  }

  const gps = readAvailableLocation();
  const destinationLabel =
    destination.type === "inbox"
      ? "Inbox"
      : destination.type === "new_thread"
        ? "New Thread"
        : recentThreads.find((thread) => thread.id === destination.threadId)
            ?.title || "Thread";

  return (
    <div className="capture-workspace">
      <div className="capture-card outdoor-card" aria-label="New Capture">
        <OutdoorCaptureDock
          mode={mode}
          onChange={onModeChange}
          disabled={!ready || isPending}
        />
        <p className="outdoor-status" role="status">
          <span>Destination: {destinationLabel}</span>
          <span>GPS: {gps ? "available" : "unavailable"}</span>
          <span>{online ? "Online" : "Offline · local save"}</span>
          {saveConfirmation ? <span>{saveConfirmation}</span> : null}
        </p>
        <div className="capture-composer">
          <span className="capture-label">Outdoor Quick Capture</span>
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

          {mode === "type" ? (
            <>
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
            </>
          ) : null}

          {mode === "audio" ? (
            <button
              type="button"
              className="outdoor-hold"
              aria-label="Hold to record audio"
              disabled={!ready || isPending}
              onPointerDown={(event) => {
                event.preventDefault();
                void commitRecording("audio");
              }}
              onPointerUp={() => recordAbortRef.current?.abort()}
              onPointerLeave={() => recordAbortRef.current?.abort()}
            >
              {recordingLabel ?? "Hold to record audio (max 10 min)"}
            </button>
          ) : null}

          {mode === "video" ? (
            <button
              type="button"
              className="outdoor-hold"
              aria-label="Record video"
              disabled={!ready || isPending}
              onClick={() => {
                if (recordAbortRef.current) {
                  recordAbortRef.current.abort();
                  return;
                }
                void commitRecording("video");
              }}
            >
              {recordingLabel ?? "Record video (max 2 min)"}
            </button>
          ) : null}

          {mode === "photo" ? (
            <p className="capture-persistence">Camera opener is one tap away.</p>
          ) : null}

          <div className="capture-media-actions">
            <button
              type="button"
              className="capture-retry"
              onClick={() => fileInputRef.current?.click()}
              disabled={!ready || isPending}
            >
              Add media
            </button>
            <input
              ref={cameraInputRef}
              className="capture-file-input"
              type="file"
              accept="image/*"
              capture="environment"
              aria-label="Take photo"
              onChange={(event) => {
                void onFilesSelected(event.target.files);
                event.target.value = "";
                setMode("type");
              }}
            />
            <input
              ref={fileInputRef}
              className="capture-file-input"
              type="file"
              accept="image/*,audio/*,video/*"
              multiple
              aria-label="Choose existing media"
              onChange={(event) => {
                void onFilesSelected(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
          {pendingAttachments.length > 0 ? (
            <ul className="capture-attachment-drafts" aria-label="Selected media">
              {pendingAttachments.map((attachment, index) => (
                <li key={`${attachment.fileName}-${index}`}>
                  {attachment.fileName}
                  <button
                    type="button"
                    className="capture-retry"
                    onClick={() =>
                      setPendingAttachments((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {mode === "type" || pendingAttachments.length > 0 ? (
          <button
            type="button"
            onClick={commit}
            disabled={
              !ready ||
              isPending ||
              (draft.trim().length === 0 && pendingAttachments.length === 0)
            }
          >
            Capture
          </button>
        ) : null}
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
                <CaptureEntry
                  capture={capture}
                  onRetry={() => void runForegroundSync()}
                  onRemoveLocalMedia={onRemoveLocalMedia}
                  onRestoreLocalMedia={onRestoreLocalMedia}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {threads.map(({ thread, captures, enrichments }) => (
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
                <CaptureEntry
                  capture={capture}
                  onRetry={() => void runForegroundSync()}
                  onRemoveLocalMedia={onRemoveLocalMedia}
                  onRestoreLocalMedia={onRestoreLocalMedia}
                />
              </li>
            ))}
            {enrichments.map((enrichment) => (
              <li key={enrichment.id}>
                <EnrichmentEntryView enrichment={enrichment} />
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
  onRemoveLocalMedia,
  onRestoreLocalMedia,
}: {
  capture: LocalCapture;
  onRetry: () => void;
  onRemoveLocalMedia: (captureId: string, attachmentId: string) => void;
  onRestoreLocalMedia: (captureId: string, attachmentId: string) => void;
}) {
  const label =
    capture.text ||
    capture.attachments.map((attachment) => attachment.fileName).join(", ") ||
    "Capture";

  return (
    <article className="capture-entry" aria-label={label}>
      <div className="capture-entry-meta">
        <span className={`capture-status status-${capture.status}`}>
          {statusLabel(capture.status)}
        </span>
        <span className="capture-sequence">#{capture.sequence}</span>
        <time dateTime={capture.createdAt}>
          {new Date(capture.createdAt).toLocaleString()}
        </time>
      </div>
      {capture.text ? <p>{capture.text}</p> : null}
      {capture.attachments.length > 0 ? (
        <ul className="capture-attachments" aria-label="Attachments">
          {capture.attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.id}
              captureId={capture.id}
              attachment={attachment}
              onRemoveLocalMedia={onRemoveLocalMedia}
              onRestoreLocalMedia={onRestoreLocalMedia}
            />
          ))}
        </ul>
      ) : null}
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

function AttachmentRow({
  captureId,
  attachment,
  onRemoveLocalMedia,
  onRestoreLocalMedia,
}: {
  captureId: string;
  attachment: LocalAttachment;
  onRemoveLocalMedia: (captureId: string, attachmentId: string) => void;
  onRestoreLocalMedia: (captureId: string, attachmentId: string) => void;
}) {
  const availability = mediaAvailability(attachment);
  const offerRemove = canOfferLocalRemoval(attachment);

  return (
    <li>
      <span>
        {attachment.fileName} · {attachment.kind} ·{" "}
        {statusLabel(attachment.syncStatus)} ·{" "}
        <span className={`media-availability availability-${availability}`}>
          {mediaAvailabilityLabel(availability)}
        </span>
      </span>
      {offerRemove ? (
        <button
          type="button"
          className="media-remove-local"
          onClick={() => onRemoveLocalMedia(captureId, attachment.id)}
        >
          Remove from device
        </button>
      ) : null}
      {availability === "online_only" ? (
        <button
          type="button"
          className="media-restore-local"
          onClick={() => onRestoreLocalMedia(captureId, attachment.id)}
        >
          Download to device
        </button>
      ) : null}
    </li>
  );
}
