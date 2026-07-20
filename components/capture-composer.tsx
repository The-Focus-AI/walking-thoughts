"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { AttachmentDrafts } from "@/components/attachment-drafts";
import {
  OutdoorCaptureDock,
  type CaptureMode,
} from "@/components/outdoor-capture-dock";
import { EnrichmentEntryView, statusLabel } from "@/components/thread-entries";
import { loadThreadEnrichments } from "@/lib/enrichment/thread-view";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import { attachmentInputFromFile } from "@/lib/local-capture/attachment-input";
import { getDestinationSession } from "@/lib/local-capture/destination";
import {
  prefetchLocation,
  readAvailableLocation,
} from "@/lib/local-capture/location";
import {
  canOfferLocalRemoval,
  mediaAvailability,
  mediaAvailabilityLabel,
  removeLocalOriginal,
  restoreLocalOriginal,
} from "@/lib/local-capture/local-media-retention";
import { createIdbMediaStore } from "@/lib/local-capture/media-store";
import {
  persistenceLabel,
  requestPersistentStorage,
} from "@/lib/local-capture/persistence";
import {
  AUDIO_LIMIT_MS,
  VIDEO_LIMIT_MS,
  createRecorder,
} from "@/lib/local-capture/recording";
import { getCaptureStore } from "@/lib/local-capture/store";
import { chronologicalThreadEntries } from "@/lib/local-capture/thread-timeline";
import type {
  AttachmentInput,
  LocalAttachment,
  LocalCapture,
  LocalThread,
  PersistenceResult,
  ThreadDestination,
} from "@/lib/local-capture/types";
import {
  enablePushNotifications,
  evaluatePushOptInAfterSync,
  type AfterSyncPushOptInResult,
} from "@/lib/push/client";
import {
  SYNC_CYCLE_EVENT,
  runSyncCycle,
  type SyncCycleResult,
} from "@/lib/sync/cycle";
import { getMediaTransport } from "@/lib/sync/media-client";
import {
  pendingSyncCount,
  syncFooterSummary,
  syncRollup,
} from "@/lib/sync/rollup";

function formatRecordingClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type ThreadView = {
  thread: LocalThread;
  captures: LocalCapture[];
  enrichments: ThreadEnrichment[];
};

export function CaptureComposer() {
  const [draft, setDraft] = useState("");
  const [inbox, setInbox] = useState<LocalCapture[]>([]);
  const [allCaptures, setAllCaptures] = useState<LocalCapture[]>([]);
  const [threads, setThreads] = useState<ThreadView[]>([]);
  const [recentThreads, setRecentThreads] = useState<LocalThread[]>([]);
  const [destination, setDestinationState] = useState<ThreadDestination>({
    type: "new_thread",
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
  const [recordingKind, setRecordingKind] = useState<"audio" | "video" | null>(
    null,
  );
  const [recordingMs, setRecordingMs] = useState(0);
  const [saveConfirmation, setSaveConfirmation] = useState<string | null>(null);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [pushOptIn, setPushOptIn] = useState<AfterSyncPushOptInResult>({
    status: "idle",
  });
  const [pushBusy, setPushBusy] = useState(false);
  const draftSaveGeneration = useRef(0);
  const syncGeneration = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const recordAbortRef = useRef<AbortController | null>(null);

  async function refreshLists() {
    const store = getCaptureStore();
    const [nextInbox, recent, listed] = await Promise.all([
      store.listInbox(),
      store.listRecentThreads(),
      store.list(),
    ]);
    const threadViews = await Promise.all(
      recent.map(async (thread) => {
        const view = await store.listThread(thread.id);
        const enrichments = await loadThreadEnrichments(thread.id);
        return { ...view, enrichments };
      }),
    );
    setInbox(nextInbox);
    setAllCaptures(listed);
    setRecentThreads(recent);
    setThreads(threadViews);
  }

  async function runForegroundSync() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const generation = ++syncGeneration.current;
    setIsSyncing(true);
    try {
      const syncBatch = await runSyncCycle({
        store: getCaptureStore(),
      });
      if (generation === syncGeneration.current) {
        const optIn = evaluatePushOptInAfterSync({
          successfulSyncResultCount: syncBatch.capturesPushed,
        });
        if (optIn.status !== "idle") {
          setPushOptIn(optIn);
        }
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

  async function onEnableNotifications() {
    setPushBusy(true);
    try {
      const result = await enablePushNotifications({
        vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
      });
      setPushOptIn(result);
    } finally {
      setPushBusy(false);
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
    const onCycle = (event: Event) => {
      const detail = (event as CustomEvent<SyncCycleResult>).detail;
      if (!detail || detail.skippedOffline) return;
      void refreshLists();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(SYNC_CYCLE_EVENT, onCycle);
    return () => {
      window.clearTimeout(start);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(SYNC_CYCLE_EVENT, onCycle);
    };
    // Foreground sync should arm once the composer is ready and on reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runForegroundSync closes over latest store helpers
  }, [ready]);

  // Keep Enrichment moving while any Capture is enriching and the shell is open.
  useEffect(() => {
    if (!ready || !online) return;
    const hasEnriching = allCaptures.some(
      (capture) => capture.status === "enriching",
    );
    if (!hasEnriching) return;
    const timer = window.setInterval(() => {
      void runForegroundSync();
    }, 2500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drain via runForegroundSync
  }, [ready, online, allCaptures]);

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

  function syncDestinationFromSession() {
    setDestinationState(getDestinationSession().get());
  }

  function onStartNewThread() {
    getDestinationSession().startNewThread();
    setDestinationState(getDestinationSession().get());
  }

  function onContinueThread(threadId: string) {
    getDestinationSession().set({ type: "thread", threadId });
    setDestinationState(getDestinationSession().get());
  }

  async function onFilesSelected(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next = Array.from(fileList).map((file) =>
      attachmentInputFromFile(file),
    );
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

  /** Record into a reviewable draft — never auto-commit under poor connectivity. */
  async function stageRecording(kind: "audio" | "video") {
    if (recordingKind) return;
    setError(null);
    setRecordingKind(kind);
    setRecordingMs(0);
    const controller = new AbortController();
    recordAbortRef.current = controller;
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      setRecordingMs(Date.now() - startedAt);
    }, 200);
    try {
      const result = await createRecorder().record(kind, {
        signal: controller.signal,
        maxMs: kind === "audio" ? AUDIO_LIMIT_MS : VIDEO_LIMIT_MS,
      });
      if (result.bytes.size === 0) return;
      setPendingAttachments((current) => [
        ...current,
        {
          kind: result.kind,
          mimeType: result.mimeType,
          fileName: result.fileName,
          bytes: result.bytes,
        },
      ]);
      setMode("type");
      if (result.hitLimit) {
        setSaveConfirmation(
          kind === "audio"
            ? "Audio hit the 10-minute limit — review below"
            : "Video hit the 2-minute limit — review below",
        );
      } else {
        setSaveConfirmation("Recording ready — review, then Capture");
      }
    } catch {
      setError(`Could not record ${kind}`);
    } finally {
      window.clearInterval(tick);
      setRecordingKind(null);
      setRecordingMs(0);
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
  const activeThreadId =
    destination.type === "thread" ? destination.threadId : null;
  const activeView =
    threads.find((view) => view.thread.id === activeThreadId) ?? null;
  const timeline = activeView
    ? chronologicalThreadEntries(activeView.captures, activeView.enrichments)
    : [];
  const isEnriching = Boolean(
    activeView?.captures.some((capture) => capture.status === "enriching"),
  );
  const trailTitle = activeView?.thread.title ?? "Today's hike";
  const trailStatus =
    destination.type === "thread"
      ? `Adding to “${trailTitle}”`
      : "First Capture starts today's Thread";

  const rollup = syncRollup(allCaptures.map((capture) => capture.status));
  const footerSummary = syncFooterSummary(rollup, { running: isSyncing });

  const canCapture =
    ready &&
    !isPending &&
    !recordingKind &&
    (draft.trim().length > 0 || pendingAttachments.length > 0);

  const composer = (
    <div className="capture-card outdoor-card trail-dock-card" aria-label="New Capture">
      <OutdoorCaptureDock
        mode={mode}
        onChange={onModeChange}
        disabled={!ready || isPending || Boolean(recordingKind)}
      />
      <p className="outdoor-status" role="status">
        <span>{trailStatus}</span>
        <span>GPS: {gps ? "available" : "unavailable"}</span>
        <span>
          {online
            ? "Network online · Captures sync when ready"
            : "Network offline · Captures stay on this phone"}
        </span>
        {saveConfirmation ? <span>{saveConfirmation}</span> : null}
      </p>
      {recordingKind ? (
        <p className="recording-banner" role="status" data-testid="recording-banner">
          Recording {recordingKind} · {formatRecordingClock(recordingMs)}
          {recordingKind === "video" ? " · tap Stop when finished" : " · release to stop"}
        </p>
      ) : null}
      <div className="capture-composer">
        <span className="capture-label">Add to this Thread</span>
        {mode === "type" || pendingAttachments.length > 0 ? (
          <>
            <label className="capture-field-label" htmlFor="capture-text">
              Capture text
            </label>
            <textarea
              id="capture-text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="What did you notice?"
              rows={2}
              disabled={!ready || isPending || Boolean(recordingKind)}
            />
          </>
        ) : null}

        {mode === "audio" ? (
          <button
            type="button"
            className={
              recordingKind === "audio" ? "outdoor-hold recording" : "outdoor-hold"
            }
            aria-label={
              recordingKind === "audio" ? "Release to stop audio" : "Hold to record audio"
            }
            disabled={!ready || isPending}
            onPointerDown={(event) => {
              event.preventDefault();
              void stageRecording("audio");
            }}
            onPointerUp={() => recordAbortRef.current?.abort()}
            onPointerLeave={() => recordAbortRef.current?.abort()}
          >
            {recordingKind === "audio"
              ? `Recording… ${formatRecordingClock(recordingMs)}`
              : "Hold to record audio (max 10 min)"}
          </button>
        ) : null}

        {mode === "video" ? (
          <button
            type="button"
            className={
              recordingKind === "video" ? "outdoor-hold recording" : "outdoor-hold"
            }
            aria-label={
              recordingKind === "video" ? "Stop video recording" : "Start video recording"
            }
            disabled={!ready || isPending}
            onClick={() => {
              if (recordAbortRef.current) {
                recordAbortRef.current.abort();
                return;
              }
              void stageRecording("video");
            }}
          >
            {recordingKind === "video"
              ? `Stop · ${formatRecordingClock(recordingMs)}`
              : "Start video recording (max 2 min)"}
          </button>
        ) : null}

        {mode === "photo" ? (
          <p className="capture-persistence">
            Camera opens next — the photo lands here for review before Capture.
          </p>
        ) : null}

        <div className="capture-media-actions">
          <button
            type="button"
            className="capture-add-media"
            onClick={() => fileInputRef.current?.click()}
            disabled={!ready || isPending || Boolean(recordingKind)}
          >
            Add photo or video
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
              setSaveConfirmation("Photo ready — review, then Capture");
            }}
          />
          <input
            ref={fileInputRef}
            className="capture-file-input"
            type="file"
            accept="image/*,audio/*,video/*"
            multiple
            aria-label="Choose photo or video from device"
            onChange={(event) => {
              void onFilesSelected(event.target.files);
              event.target.value = "";
              setMode("type");
              setSaveConfirmation("Media ready — review, then Capture");
            }}
          />
        </div>
        <AttachmentDrafts
          attachments={pendingAttachments}
          onRemove={(index) =>
            setPendingAttachments((current) =>
              current.filter((_, itemIndex) => itemIndex !== index),
            )
          }
        />
      </div>
      <button type="button" onClick={commit} disabled={!canCapture}>
        {isPending ? "Saving…" : "Capture"}
      </button>
    </div>
  );

  return (
    <div className="capture-workspace trail-aca">
      {pushOptIn.status === "offer" ? (
        <div className="capture-push-opt-in" role="status">
          <p>
            Captures are syncing. Enable notifications to hear when a Thread
            batch finishes or needs attention.
          </p>
          <button
            type="button"
            className="capture-retry"
            onClick={() => void onEnableNotifications()}
            disabled={pushBusy}
          >
            Enable notifications
          </button>
        </div>
      ) : null}
      {pushOptIn.status === "denied" ? (
        <p className="capture-persistence" role="status">
          Notifications are off for this browser. Capture, sync, and Enrichment
          still work.
        </p>
      ) : null}
      {pushOptIn.status === "unavailable" ? (
        <p className="capture-persistence" role="status">
          {pushOptIn.reason}. Capture, sync, and Enrichment still work.
        </p>
      ) : null}

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

      <section className="capture-section trail-thread" aria-label={trailTitle}>
        <div className="capture-section-header">
          <h1 className="capture-section-title">{trailTitle}</h1>
          {activeView ? (
            <span className="capture-revision">
              Revision {activeView.thread.revision}
            </span>
          ) : null}
        </div>
        <div className="trail-thread-actions">
          <Link className="topbar-link" href="/threads">
            All Threads
          </Link>
          {destination.type === "thread" ? (
            <>
              <Link
                className="topbar-link"
                href={`/threads/${destination.threadId}`}
              >
                Open chat
              </Link>
              <button
                type="button"
                className="capture-retry"
                onClick={onStartNewThread}
                disabled={!ready || isPending}
              >
                Start new Thread
              </button>
            </>
          ) : null}
        </div>

        {timeline.length > 0 ? (
          <ul className="capture-list trail-timeline trail-gutter-list">
            {timeline.map((entry) =>
              entry.kind === "capture" ? (
                <li key={entry.capture.id}>
                  <CaptureEntry
                    capture={entry.capture}
                    showSpeaker
                    gutter
                    onRetry={() => void runForegroundSync()}
                    onRemoveLocalMedia={onRemoveLocalMedia}
                    onRestoreLocalMedia={onRestoreLocalMedia}
                  />
                </li>
              ) : (
                <li key={entry.enrichment.id}>
                  <EnrichmentEntryView enrichment={entry.enrichment} />
                </li>
              ),
            )}
            {isEnriching ? (
              <li>
                <article
                  className="capture-entry enrichment-pending thread-speaker-agent capture-gutter gutter-enriching"
                  aria-label="Walking Thoughts is preparing a reply"
                >
                  <span className="gutter-label">Enriching</span>
                  <div>
                    <div className="capture-entry-meta">
                      <span className="thread-speaker">Walking Thoughts</span>
                    </div>
                    <p>Preparing a reply from this Thread&apos;s history…</p>
                  </div>
                </article>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="trail-thread-empty">
            Nothing on today&apos;s hike yet. Your next Capture opens a Thread;
            replies from Walking Thoughts show up here after sync.
          </p>
        )}
      </section>

      {inbox.length > 0 ? (
        <section className="capture-section" aria-label="Inbox">
          <h2 className="capture-section-title">Inbox</h2>
          <p className="capture-persistence">
            Older unassigned Captures. Prefer today&apos;s Thread above for the
            trail.
          </p>
          <ul className="capture-list trail-gutter-list">
            {inbox.map((capture) => (
              <li key={capture.id}>
                <CaptureEntry
                  capture={capture}
                  gutter
                  onRetry={() => void runForegroundSync()}
                  onRemoveLocalMedia={onRemoveLocalMedia}
                  onRestoreLocalMedia={onRestoreLocalMedia}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {recentThreads.length > 1 ||
      (recentThreads.length === 1 &&
        recentThreads[0]?.id !== activeThreadId) ? (
        <section className="capture-section" aria-label="Switch Thread">
          <h2 className="capture-section-title">Continue another Thread</h2>
          <ul className="thread-switch-list">
            {recentThreads
              .filter((thread) => thread.id !== activeThreadId)
              .slice(0, 5)
              .map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    className="capture-retry"
                    onClick={() => onContinueThread(thread.id)}
                  >
                    {thread.title}
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <footer className="trail-sync-footer" role="status" data-testid="trail-sync-footer">
        <div>
          <strong>{footerSummary}</strong>
          <p className="capture-persistence">
            {pendingSyncCount(rollup) > 0
              ? `${rollup.saved_locally} local · ${rollup.syncing} syncing · ${rollup.enriching} enriching · ${rollup.needs_attention} need attention`
              : "Sync drains while the app is open and online"}
          </p>
        </div>
        <button
          type="button"
          className="capture-retry"
          onClick={() => void runForegroundSync()}
          disabled={!ready || isSyncing}
        >
          Retry
        </button>
      </footer>

      <div className="trail-sticky-dock">{composer}</div>
    </div>
  );
}

function CaptureEntry({
  capture,
  onRetry,
  onRemoveLocalMedia,
  onRestoreLocalMedia,
  showSpeaker = false,
  gutter = false,
}: {
  capture: LocalCapture;
  onRetry: () => void;
  onRemoveLocalMedia: (captureId: string, attachmentId: string) => void;
  onRestoreLocalMedia: (captureId: string, attachmentId: string) => void;
  showSpeaker?: boolean;
  gutter?: boolean;
}) {
  const label =
    capture.text ||
    capture.attachments.map((attachment) => attachment.fileName).join(", ") ||
    "Capture";

  return (
    <article
      className={`capture-entry${showSpeaker ? " thread-speaker-you" : ""}${
        gutter ? ` capture-gutter gutter-${capture.status}` : ""
      }`}
      aria-label={label}
    >
      {gutter ? (
        <span className="gutter-label">{statusLabel(capture.status)}</span>
      ) : null}
      <div className={gutter ? "capture-gutter-body" : undefined}>
      <div className="capture-entry-meta">
        {showSpeaker ? <span className="thread-speaker">You</span> : null}
        {gutter ? null : (
          <span className={`capture-status status-${capture.status}`}>
            {statusLabel(capture.status)}
          </span>
        )}
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
      </div>
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
