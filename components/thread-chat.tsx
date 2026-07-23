"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AttachmentDrafts } from "@/components/attachment-drafts";
import { EnrichmentReport } from "@/components/enrichment-report";
import { statusLabel } from "@/components/thread-entries";
import { loadThreadEnrichments } from "@/lib/enrichment/thread-view";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import { attachmentInputFromFile } from "@/lib/local-capture/attachment-input";
import { readAvailableLocation } from "@/lib/local-capture/location";
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
import { getSplitTransport } from "@/lib/sync/split-client";
import { threadToMarkdown } from "@/lib/thread-export/markdown";

type ThreadChatProps = {
  threadId: string;
  /** Compact embed (e.g. Map Journal panel) hides the full-page chrome. */
  embedded?: boolean;
  onClose?: () => void;
};

function MediaPreview({ attachment }: { attachment: LocalAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const key = attachment.localObjectKey ?? attachment.thumbnailObjectKey;
    if (!key) return;
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
  }, [attachment.localObjectKey, attachment.thumbnailObjectKey]);

  if (url && attachment.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local blob URL
      <img src={url} alt={attachment.fileName} className="chat-media" />
    );
  }
  if (url && attachment.kind === "video") {
    return <video className="chat-media" src={url} controls playsInline />;
  }
  if (url && attachment.kind === "audio") {
    return <audio className="chat-media" src={url} controls />;
  }
  return <span className="thread-media-name">{attachment.fileName}</span>;
}

/** The Thread's base Capture, presented as the page's subject. */
function CaptureHero({ capture }: { capture: LocalCapture }) {
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
            <li key={attachment.id}>
              <MediaPreview attachment={attachment} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="thread-capture-meta">
        <span>You</span>
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
    </article>
  );
}

/** A later Capture in the Thread's conversation. */
function ConversationCapture({ capture }: { capture: LocalCapture }) {
  return (
    <article
      className="chat-turn chat-turn-you"
      data-testid="chat-turn-you"
      aria-label={capture.text || "Capture"}
    >
      <div className="chat-bubble chat-bubble-you">
        {capture.text ? <p>{capture.text}</p> : null}
        {capture.attachments.length > 0 ? (
          <ul className="chat-attachments">
            {capture.attachments.map((attachment) => (
              <li key={attachment.id}>
                <MediaPreview attachment={attachment} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="chat-meta">
        <span>You</span>
        <span className={`capture-status status-${capture.status}`}>
          {statusLabel(capture.status)}
        </span>
        <time dateTime={capture.createdAt}>
          {new Date(capture.createdAt).toLocaleTimeString()}
        </time>
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
export function ThreadChat({ threadId, embedded = false, onClose }: ThreadChatProps) {
  const [thread, setThread] = useState<LocalThread | null>(null);
  const [captures, setCaptures] = useState<LocalCapture[]>([]);
  const [enrichments, setEnrichments] = useState<ThreadEnrichment[]>([]);
  const [draft, setDraft] = useState("");
  const [media, setMedia] = useState<AttachmentInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
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
        router.push("/threads");
        return;
      }
      await store.applyThreadSplit(result);
      void runSyncCycle({ store });
      router.push("/threads");
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
            <Link className="topbar-link" href="/threads">
              ← Threads
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
          {onClose ? (
            <button
              type="button"
              className="journal-close"
              aria-label="Close Thread"
              onClick={onClose}
            >
              ✕
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
          <CaptureHero capture={baseCapture.capture} />
        ) : null}
        {conversation.map((entry) =>
          entry.kind === "capture" ? (
            <ConversationCapture key={entry.capture.id} capture={entry.capture} />
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
            aria-label="Walking Thoughts is researching"
          >
            <span className="thread-speaker">Walking Thoughts</span>
            <p>Researching this Capture…</p>
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
