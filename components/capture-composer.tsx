"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { AttachmentDrafts } from "@/components/attachment-drafts";
import { ScaleBar } from "@/components/sheet";
import {
  deskWaitingLabel,
  summarizeDesk,
  todayTally,
} from "@/lib/desk/summary";
import { attachmentInputFromFile } from "@/lib/local-capture/attachment-input";
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
import { getCaptureStore } from "@/lib/local-capture/store";
import type {
  AttachmentInput,
  LocalCapture,
  LocalThread,
  PersistenceResult,
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
import { syncRollup } from "@/lib/sync/rollup";

function formatRecordingClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * The trail surface has one job: get the thought out of the walker's head and
 * onto this phone. Composer, the map behind it, and a scale-bar footer that
 * says what today holds and whether anything is waiting at the desk — never
 * the Threads themselves. Those live on Days, where there is room to read
 * them (ADR 0011 still holds: each Capture starts its own Thread).
 */
export function CaptureComposer() {
  const [draft, setDraft] = useState("");
  const [captures, setCaptures] = useState<LocalCapture[]>([]);
  const [threads, setThreads] = useState<LocalThread[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [persistence, setPersistence] = useState<PersistenceResult | null>(null);
  const [ready, setReady] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentInput[]>(
    [],
  );
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
    const [listed, recent] = await Promise.all([
      store.list(),
      store.listRecentThreads(),
    ]);
    setCaptures(listed);
    setThreads(recent);
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

  useEffect(() => {
    let active = true;
    prefetchLocation();

    (async () => {
      const store = getCaptureStore();
      const savedDraft = await store.getDraft();
      if (!active) return;
      setDraft(savedDraft);
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
    const hasEnriching = captures.some(
      (capture) => capture.status === "enriching",
    );
    if (!hasEnriching) return;
    const timer = window.setInterval(() => {
      void runForegroundSync();
    }, 2500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drain via runForegroundSync
  }, [ready, online, captures]);

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
    startTransition(async () => {
      const store = getCaptureStore();
      try {
        const location = readAvailableLocation();
        await store.commit(text, location, {
          destination: { type: "new_thread" },
          attachments: attachmentsSnapshot,
        });
        setSaveConfirmation("Saved locally — its own Thread");
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

  function toggleRecording(kind: "audio" | "video") {
    if (recordingKind) {
      recordAbortRef.current?.abort();
      return;
    }
    void stageRecording(kind);
  }

  const gps = readAvailableLocation();
  const rollup = syncRollup(captures.map((capture) => capture.status));
  const desk = summarizeDesk({ threads, captures });
  const waiting = deskWaitingLabel(desk);

  const canCapture =
    ready &&
    !isPending &&
    !recordingKind &&
    (draft.trim().length > 0 || pendingAttachments.length > 0);

  return (
    <section className="capture-workspace trail-thread" aria-label="Capture">
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

      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="capture-card outdoor-card" aria-label="New Capture">
        {recordingKind ? (
          <div
            className="recording-banner"
            role="status"
            data-testid="recording-banner"
          >
            <span>
              Recording {recordingKind} · {formatRecordingClock(recordingMs)}
            </span>
            <button
              type="button"
              className="recording-stop"
              onClick={() => recordAbortRef.current?.abort()}
            >
              Stop recording
            </button>
          </div>
        ) : null}
        <div className="capture-composer">
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
          <AttachmentDrafts
            attachments={pendingAttachments}
            onRemove={(index) =>
              setPendingAttachments((current) =>
                current.filter((_, itemIndex) => itemIndex !== index),
              )
            }
          />
          <div
            className="capture-actions"
            role="toolbar"
            aria-label="Capture actions"
          >
            <button
              type="button"
              className="capture-icon-btn"
              aria-label="Record audio"
              aria-pressed={recordingKind === "audio"}
              title="Record audio (max 10 min)"
              disabled={!ready || isPending || recordingKind === "video"}
              onClick={() => toggleRecording("audio")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
            <button
              type="button"
              className="capture-icon-btn"
              aria-label="Record video"
              aria-pressed={recordingKind === "video"}
              title="Record video (max 2 min)"
              disabled={!ready || isPending || recordingKind === "audio"}
              onClick={() => toggleRecording("video")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="6" width="12" height="12" rx="2" />
                <path d="m15 10 6-3v10l-6-3" />
              </svg>
            </button>
            <button
              type="button"
              className="capture-icon-btn"
              aria-label="Take photo"
              title="Take photo"
              disabled={!ready || isPending || Boolean(recordingKind)}
              onClick={() => cameraInputRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8h3l2-3h6l2 3h3v11H4V8Z" />
                <circle cx="12" cy="13" r="3.4" />
              </svg>
            </button>
            <button
              type="button"
              className="capture-icon-btn"
              aria-label="Add photo or video"
              title="Add photo or video from this phone"
              disabled={!ready || isPending || Boolean(recordingKind)}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m20.5 12.5-7.8 7.8a5 5 0 0 1-7-7l8.4-8.5a3.4 3.4 0 0 1 4.9 4.9l-8.5 8.4a1.8 1.8 0 0 1-2.5-2.5l7.8-7.8" />
              </svg>
            </button>
            <button
              type="button"
              className="capture-commit"
              onClick={commit}
              disabled={!canCapture}
            >
              {isPending ? "Saving…" : "Capture"}
            </button>
          </div>
          <input
            ref={cameraInputRef}
            className="capture-file-input"
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Camera photo input"
            onChange={(event) => {
              void onFilesSelected(event.target.files);
              event.target.value = "";
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
              setSaveConfirmation("Media ready — review, then Capture");
            }}
          />
        </div>
        <p className="capture-context" role="status">
          <span>Each Capture starts its own Thread</span>
          <span aria-hidden="true">·</span>
          <span>GPS {gps ? "on" : "off"}</span>
          <span aria-hidden="true">·</span>
          <span>{online ? "Network online" : "Network offline"}</span>
          {saveConfirmation ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{saveConfirmation}</span>
            </>
          ) : null}
        </p>
      </div>

      <footer
        className="trail-sync-footer"
        role="status"
        data-testid="trail-sync-footer"
      >
        <ScaleBar />
        <div className="trail-sync-footer-lines">
          <strong className="trail-sync-promise">
            Committed locally first · Synced when in range
          </strong>
          <p className="trail-sync-tally" data-testid="capture-tally">
            {todayTally(captures)}
          </p>
          {persistence ? (
            <p className="capture-persistence">
              {persistenceLabel(persistence)}
            </p>
          ) : null}
        </div>
        <div className="trail-sync-footer-actions">
          <Link className="trail-desk-link" href="/days" data-testid="desk-link">
            {waiting ? `${waiting} · Days` : "Days"}
          </Link>
          {rollup.needs_attention > 0 ? (
            <button
              type="button"
              className="capture-retry"
              onClick={() => void runForegroundSync()}
              disabled={!ready || isSyncing}
            >
              Retry sync
            </button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}
