"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AttachmentDrafts } from "@/components/attachment-drafts";
import { EnrichmentReport } from "@/components/enrichment-report";
import { statusLabel } from "@/components/thread-entries";
import {
  artifactHref,
  artifactsByThread,
  loadArtifacts,
  publishArtifact,
  readCachedArtifacts,
} from "@/lib/artifacts/client";
import type { ArtifactSummary } from "@/lib/artifacts/types";
import { loadThreadEnrichments } from "@/lib/enrichment/thread-view";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import { attachmentInputFromFile } from "@/lib/local-capture/attachment-input";
import { readAvailableLocation } from "@/lib/local-capture/location";
import {
  canOfferLocalRemoval,
  mediaAvailability,
  mediaAvailabilityLabel,
  removeLocalOriginal,
  restoreLocalOriginal,
} from "@/lib/local-capture/local-media-retention";
import { createIdbMediaStore } from "@/lib/local-capture/media-store";
import { getCaptureStore } from "@/lib/local-capture/store";
import { chronologicalThreadEntries } from "@/lib/local-capture/thread-timeline";
import type {
  AttachmentInput,
  LocalAttachment,
  LocalCapture,
  LocalThread,
} from "@/lib/local-capture/types";
import { SYNC_CYCLE_EVENT, runSyncCycle } from "@/lib/sync/cycle";
import { getMediaTransport } from "@/lib/sync/media-client";
import { getReviewTransport } from "@/lib/sync/review-client";
import { getSplitTransport } from "@/lib/sync/split-client";
import { threadToMarkdown } from "@/lib/thread-export/markdown";

type ThreadChatProps = {
  threadId: string;
  /** Compact embed (e.g. Map Journal panel) hides the full-page chrome. */
  embedded?: boolean;
  onClose?: () => void;
  /** Called after the review state changes (true = marked reviewed). */
  onReviewedChange?: (reviewed: boolean) => void;
};

function MediaPreview({ attachment }: { attachment: LocalAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [remoteFailed, setRemoteFailed] = useState(false);
  useEffect(() => {
    const key = attachment.localObjectKey ?? attachment.thumbnailObjectKey;
    if (!key) {
      // Captured on another device: stream the private server copy.
      if (attachment.remoteObjectKey) {
        setUrl(`/api/media/${attachment.id}`);
      }
      return;
    }
    let objectUrl: string | null = null;
    let active = true;
    void createIdbMediaStore()
      .get(key)
      .then((blob) => {
        if (!blob || !active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    attachment.id,
    attachment.localObjectKey,
    attachment.thumbnailObjectKey,
    attachment.remoteObjectKey,
  ]);

  const showUrl = remoteFailed ? null : url;
  if (showUrl && attachment.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local blob or private media URL
      <img
        src={showUrl}
        alt={attachment.fileName}
        className="chat-media"
        onError={() => setRemoteFailed(true)}
      />
    );
  }
  if (showUrl && attachment.kind === "video") {
    return (
      <video
        className="chat-media"
        src={showUrl}
        controls
        playsInline
        onError={() => setRemoteFailed(true)}
      />
    );
  }
  if (showUrl && attachment.kind === "audio") {
    return (
      <audio
        className="chat-media"
        src={showUrl}
        controls
        onError={() => setRemoteFailed(true)}
      />
    );
  }
  // Nothing to show: the meta line under it already names the file and says
  // where the bytes are.
  return null;
}

type MediaRetention = {
  onRemoveLocal: (captureId: string, attachmentId: string) => void;
  onRestoreLocal: (captureId: string, attachmentId: string) => void;
};

/**
 * One attachment with its honest storage state: where the bytes are, and the
 * one act available on them. Freeing the phone is a desk decision — it can
 * only be offered once the private server copy is verified.
 */
function MediaItem({
  captureId,
  attachment,
  retention,
}: {
  captureId: string;
  attachment: LocalAttachment;
  retention?: MediaRetention;
}) {
  const availability = mediaAvailability(attachment);
  return (
    <li>
      <MediaPreview attachment={attachment} />
      <p className="thread-media-meta">
        <span>{attachment.fileName}</span>
        <span aria-hidden="true">·</span>
        <span className={`media-availability availability-${availability}`}>
          {mediaAvailabilityLabel(availability)}
        </span>
        <span aria-hidden="true">·</span>
        <span>{statusLabel(attachment.syncStatus)}</span>
      </p>
      {retention && canOfferLocalRemoval(attachment) ? (
        <button
          type="button"
          className="media-remove-local"
          onClick={() => retention.onRemoveLocal(captureId, attachment.id)}
        >
          Remove from device
        </button>
      ) : null}
      {retention && availability === "online_only" ? (
        <button
          type="button"
          className="media-restore-local"
          onClick={() => retention.onRestoreLocal(captureId, attachment.id)}
        >
          Download to device
        </button>
      ) : null}
    </li>
  );
}

/** The Thread's base Capture, presented as the page's subject. */
function CaptureHero({
  capture,
  retention,
}: {
  capture: LocalCapture;
  retention?: MediaRetention;
}) {
  return (
    <article
      className="thread-capture-hero"
      data-testid="thread-capture-hero"
      aria-label={capture.text || "Capture"}
    >
      {capture.text ? <p className="thread-capture-words">{capture.text}</p> : null}
      {capture.attachments.length > 0 ? (
        <ul className="thread-capture-media">
          {capture.attachments.map((attachment) => (
            <MediaItem
              key={attachment.id}
              captureId={capture.id}
              attachment={attachment}
              retention={retention}
            />
          ))}
        </ul>
      ) : null}
      <div className="thread-capture-meta">
        <time dateTime={capture.createdAt}>
          {new Date(capture.createdAt).toLocaleString()}
        </time>
        {capture.location ? (
          <span>
            {capture.location.latitude.toFixed(4)},{" "}
            {capture.location.longitude.toFixed(4)}
          </span>
        ) : null}
        <span className={`capture-status status-${capture.status}`}>
          {statusLabel(capture.status)}
        </span>
      </div>
      {capture.status === "needs_attention" ? (
        <p className="thread-capture-reason">
          {capture.syncReason?.startsWith("missing_original_media")
            ? "The original media never reached the server, so there is nothing to research. Move this Thread to Trash if it is not worth keeping."
            : (capture.syncReason ?? "Synchronization failed")}
        </p>
      ) : null}
    </article>
  );
}

/**
 * A later Capture in the Thread, as a survey-log entry: station gutter
 * (time over status) with the walker's words in italic serif — the italic
 * itself says "you said this"; no speaker labels, no bubbles.
 */
function ConversationCapture({
  capture,
  retention,
}: {
  capture: LocalCapture;
  retention?: MediaRetention;
}) {
  return (
    <article
      className="thread-entry capture-gutter"
      data-testid="chat-turn-you"
      aria-label={capture.text || "Capture"}
    >
      <div className="station-gutter">
        <time className="station-time" dateTime={capture.createdAt}>
          {new Date(capture.createdAt).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </time>
        <span className={`gutter-label capture-status status-${capture.status}`}>
          {statusLabel(capture.status)}
        </span>
      </div>
      <div className="thread-entry-body">
        {capture.text ? (
          <p className="capture-words">{capture.text}</p>
        ) : null}
        {capture.attachments.length > 0 ? (
          <ul className="chat-attachments">
            {capture.attachments.map((attachment) => (
              <MediaItem
                key={attachment.id}
                captureId={capture.id}
                attachment={attachment}
                retention={retention}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Thread review page: the base Capture up top, its report-style Enrichment
 * rendered as markdown beneath it, the conversation after, and the whole
 * Thread one "Copy as markdown" away. Replying here is the explicit way to
 * add to this Thread — new Captures elsewhere start their own.
 */
export function ThreadChat({
  threadId,
  embedded = false,
  onClose,
  onReviewedChange,
}: ThreadChatProps) {
  const [thread, setThread] = useState<LocalThread | null>(null);
  const [captures, setCaptures] = useState<LocalCapture[]>([]);
  const [enrichments, setEnrichments] = useState<ThreadEnrichment[]>([]);
  const [draft, setDraft] = useState("");
  const [media, setMedia] = useState<AttachmentInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [artifact, setArtifact] = useState<ArtifactSummary | null>(null);
  const [publishing, setPublishing] = useState(false);
  const router = useRouter();
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const fileRef = useRef<HTMLInputElement | null>(null);
  const copyResetRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const store = getCaptureStore();
    const view = await store.listThread(threadId);
    const nextEnrichments = await loadThreadEnrichments(threadId);
    setThread(view.thread);
    setCaptures(view.captures);
    setEnrichments(nextEnrichments);
    // The retained list first so the page is reachable offline, then the
    // server's answer — a report enriched moments ago publishes itself.
    setArtifact(artifactsByThread(readCachedArtifacts()).get(threadId) ?? null);
    const published = artifactsByThread(await loadArtifacts()).get(threadId);
    if (published) setArtifact(published);
  }, [threadId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await refresh();
      } catch {
        if (active) setError("Could not open this Thread");
      }
    })();
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void runSyncCycle({ store: getCaptureStore() }).then(() => refresh());
    };
    const onOffline = () => setOnline(false);
    const onCycle = () => {
      void refresh();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(SYNC_CYCLE_EVENT, onCycle);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(SYNC_CYCLE_EVENT, onCycle);
    };
  }, [refresh]);

  const isEnriching = captures.some((capture) => capture.status === "enriching");

  // Keep pulling while Enrichment is in flight so the report lands in view.
  useEffect(() => {
    if (!isEnriching || !online) return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          await runSyncCycle({ store: getCaptureStore() });
          await refresh();
        } catch {
          // Retryable; the researching notice stays visible.
        }
      })();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [isEnriching, online, refresh]);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
    };
  }, []);

  /**
   * Free the phone of one original once the private server copy verifies —
   * and pull it back down on request. The Thread stays readable either way.
   */
  async function onRemoveLocal(captureId: string, attachmentId: string) {
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
      await refresh();
    } catch {
      setError("Could not remove local media until the server copy is verified");
    }
  }

  async function onRestoreLocal(captureId: string, attachmentId: string) {
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
          verify: async (id) => (transport.verify ? transport.verify(id) : true),
          download: (id) => transport.download!(id),
        },
      });
      await refresh();
    } catch {
      setError("Could not restore media from the private server copy");
    }
  }

  const retention: MediaRetention = {
    onRemoveLocal: (captureId, attachmentId) =>
      void onRemoveLocal(captureId, attachmentId),
    onRestoreLocal: (captureId, attachmentId) =>
      void onRestoreLocal(captureId, attachmentId),
  };

  /** The desk-processing action: reviewed Threads leave the New queue. */
  async function toggleReviewed() {
    if (reviewBusy || !thread) return;
    setReviewBusy(true);
    setError(null);
    const next = !thread.reviewedAt;
    try {
      const result = await getReviewTransport().setReviewed(threadId, next);
      if (!result) {
        setError("Could not update the review state — check the connection");
        return;
      }
      const store = getCaptureStore();
      await store.setThreadReviewed(threadId, result.reviewedAt);
      await refresh();
      onReviewedChange?.(next);
    } catch {
      setError("Could not update the review state");
    } finally {
      setReviewBusy(false);
    }
  }

  /** Local-first trash: hides immediately, syncs on the next cycle. */
  async function moveToTrash() {
    if (
      !window.confirm(
        "Move this Thread to Trash? It stays recoverable for 30 days.",
      )
    ) {
      return;
    }
    setError(null);
    try {
      const store = getCaptureStore();
      await store.trashThread(threadId);
      void runSyncCycle({ store });
      router.push("/days");
    } catch {
      setError("Could not move this Thread to Trash");
    }
  }

  /** ADR 0011 repair: break a merged Thread into one Thread per Capture. */
  async function splitIntoThreads() {
    if (splitting) return;
    setSplitting(true);
    setError(null);
    try {
      const result = await getSplitTransport().splitThread(threadId);
      if (!result) {
        setError("Could not split this Thread — check the connection");
        return;
      }
      const store = getCaptureStore();
      if (result.moves.length === 0) {
        // Server already has these Captures in their own Threads (or never
        // saw this local grouping) — hydration rehomes them to server truth.
        await runSyncCycle({ store });
        router.push("/days");
        return;
      }
      await store.applyThreadSplit(result);
      void runSyncCycle({ store });
      router.push("/days");
    } catch {
      setError("Could not split this Thread");
    } finally {
      setSplitting(false);
    }
  }

  async function copyAsMarkdown() {
    if (!thread) return;
    const markdown = threadToMarkdown({ thread, captures, enrichments });
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
    copyResetRef.current = window.setTimeout(() => setCopied("idle"), 2500);
  }

  /**
   * A report publishes itself as it is enriched. This is the deliberate
   * desk act for a Thread the queue judged too slight for a page, or one
   * whose page was never written because the gateway was down.
   */
  async function publishReport() {
    if (publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const published = await publishArtifact(threadId);
      if (published) setArtifact(published);
      else setError("Could not publish this report");
    } finally {
      setPublishing(false);
    }
  }

  async function send() {
    if (busy || (!draft.trim() && media.length === 0)) return;
    setBusy(true);
    setError(null);
    try {
      const store = getCaptureStore();
      await store.commit(draft.trim(), readAvailableLocation(), {
        destination: { type: "thread", threadId },
        attachments: media,
      });
      setDraft("");
      setMedia([]);
      await refresh();

      if (navigator.onLine) {
        try {
          await runSyncCycle({ store });
        } catch {
          // Statuses remain visible on entries.
        }
        await refresh();
      }
    } catch {
      setError("Could not send the reply Capture");
    } finally {
      setBusy(false);
    }
  }

  const timeline = chronologicalThreadEntries(captures, enrichments);
  const baseCapture = timeline.find((entry) => entry.kind === "capture");
  const conversation = timeline.filter((entry) => entry !== baseCapture);

  return (
    <div
      className={embedded ? "thread-chat thread-chat-embedded" : "thread-chat"}
      data-testid="thread-chat"
    >
      <header className="thread-chat-header">
        <div>
          {!embedded ? (
            <Link className="topbar-link" href="/days">
              ← Days
            </Link>
          ) : null}
          <h1>{thread?.title ?? "Thread"}</h1>
          <p className="thread-chat-sub">
            {online
              ? "Network online · research lands here after Enrichment"
              : "Network offline · Captures stay on this phone until you reconnect"}
            {thread ? ` · rev ${thread.revision}` : null}
          </p>
        </div>
        <div className="thread-chat-tools">
          {!embedded ? (
            <button
              type="button"
              className={
                thread?.reviewedAt
                  ? "thread-copy-markdown thread-reviewed-toggle is-reviewed"
                  : "thread-copy-markdown thread-reviewed-toggle"
              }
              data-testid="thread-reviewed-toggle"
              onClick={() => void toggleReviewed()}
              disabled={reviewBusy || !thread || !online}
              title={
                thread?.reviewedAt
                  ? "Put this Thread back in the New queue"
                  : "Done processing — remove from the New queue"
              }
            >
              {reviewBusy
                ? "Saving…"
                : thread?.reviewedAt
                  ? "Reviewed"
                  : "Mark reviewed"}
            </button>
          ) : null}
          {!embedded && captures.length > 1 ? (
            <button
              type="button"
              className="thread-copy-markdown thread-split"
              data-testid="thread-split"
              onClick={() => void splitIntoThreads()}
              disabled={splitting || !online}
              title="Move each Capture into its own Thread and research it again"
            >
              {splitting ? "Splitting…" : "Split into Threads"}
            </button>
          ) : null}
          {artifact ? (
            <a
              className="thread-copy-markdown thread-open-report"
              href={artifactHref(artifact.id)}
              target="_blank"
              rel="noreferrer"
              data-testid="thread-open-report"
              title={artifact.standfirst ?? "Read the published report"}
            >
              Open report
            </a>
          ) : !embedded && enrichments.length > 0 ? (
            <button
              type="button"
              className="thread-copy-markdown"
              data-testid="thread-publish-report"
              onClick={() => void publishReport()}
              disabled={publishing || !online}
              title="Lay this Thread's newest Enrichment out as a page"
            >
              {publishing ? "Publishing…" : "Publish report"}
            </button>
          ) : null}
          <button
            type="button"
            className="thread-copy-markdown"
            data-testid="thread-copy-markdown"
            onClick={() => void copyAsMarkdown()}
            disabled={!thread}
          >
            {copied === "copied"
              ? "Copied"
              : copied === "failed"
                ? "Copy failed"
                : "Copy as markdown"}
          </button>
          {!embedded ? (
            <button
              type="button"
              className="thread-copy-markdown thread-trash"
              data-testid="thread-trash"
              onClick={() => void moveToTrash()}
              disabled={!thread}
              title="Move this Thread to Trash (recoverable for 30 days)"
            >
              Trash
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="journal-close"
              aria-label="Close Thread"
              onClick={onClose}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          ) : null}
        </div>
      </header>

      <div
        className="thread-chat-log"
        role="log"
        aria-label="Thread review"
        aria-live="polite"
      >
        {baseCapture?.kind === "capture" ? (
          <CaptureHero capture={baseCapture.capture} retention={retention} />
        ) : null}
        {conversation.map((entry) =>
          entry.kind === "capture" ? (
            <ConversationCapture
              key={entry.capture.id}
              capture={entry.capture}
              retention={retention}
            />
          ) : (
            <EnrichmentReport
              key={entry.enrichment.id}
              enrichment={entry.enrichment}
            />
          ),
        )}
        {isEnriching ? (
          <article
            className="enrichment-report enrichment-report-pending"
            data-testid="chat-turn-pending"
            aria-label="Enriching"
          >
            <header className="enrichment-report-head">
              <span>Annotation</span>
              <span>Enriching</span>
            </header>
            <p>Enriching — researching your Capture.</p>
          </article>
        ) : null}
        {timeline.length === 0 && !isEnriching ? (
          <p className="trail-thread-empty">No Captures in this Thread yet.</p>
        ) : null}
      </div>

      {error ? (
        <p className="capture-error" role="alert">
          {error}
        </p>
      ) : null}

      {thread?.ask ? (
        <aside className="thread-ask" data-testid="thread-ask">
          <p className="thread-ask-label">Walking Thoughts needs a word</p>
          <p className="thread-ask-question">{thread.ask}</p>
          <button
            type="button"
            className="thread-ask-answer"
            onClick={() => {
              document.getElementById("thread-chat-followup")?.focus();
            }}
          >
            Answer in this Thread
          </button>
        </aside>
      ) : null}

      <footer className="thread-chat-composer">
        <label className="capture-field-label" htmlFor="thread-chat-followup">
          Reply in this Thread
        </label>
        <textarea
          id="thread-chat-followup"
          rows={2}
          value={draft}
          placeholder="Ask a follow-up about this Capture…"
          onChange={(event) => setDraft(event.target.value)}
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <AttachmentDrafts
          attachments={media}
          onRemove={(index) =>
            setMedia((current) =>
              current.filter((_, itemIndex) => itemIndex !== index),
            )
          }
        />
        <div className="thread-chat-actions">
          <button
            type="button"
            className="capture-add-media"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            Add photo or video
          </button>
          <input
            ref={fileRef}
            className="capture-file-input"
            type="file"
            accept="image/*,audio/*,video/*"
            multiple
            aria-label="Add photo or video to reply"
            onChange={(event) => {
              const files = event.target.files;
              if (!files?.length) return;
              setMedia((current) => [
                ...current,
                ...Array.from(files).map((file) =>
                  attachmentInputFromFile(file),
                ),
              ]);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="thread-chat-send"
            onClick={() => void send()}
            disabled={busy || (!draft.trim() && media.length === 0)}
          >
            {busy ? "Sending…" : "Reply"}
          </button>
        </div>
      </footer>
    </div>
  );
}
