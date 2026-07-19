"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { statusLabel } from "@/components/thread-entries";
import { loadThreadEnrichments } from "@/lib/enrichment/thread-view";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import { readAvailableLocation } from "@/lib/local-capture/location";
import { createIdbMediaStore } from "@/lib/local-capture/media-store";
import { getCaptureStore } from "@/lib/local-capture/store";
import { chronologicalThreadEntries } from "@/lib/local-capture/thread-timeline";
import type {
  AttachmentInput,
  LocalAttachment,
  LocalCapture,
  LocalThread,
  MediaKind,
} from "@/lib/local-capture/types";
import { SYNC_CYCLE_EVENT, runSyncCycle } from "@/lib/sync/cycle";

type ThreadChatProps = {
  threadId: string;
  /** Compact embed (e.g. Map Journal panel) hides the full-page chrome. */
  embedded?: boolean;
  onClose?: () => void;
};

function kindFromMime(mimeType: string): MediaKind {
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "image";
}

function CaptureBubble({
  capture,
}: {
  capture: LocalCapture;
}) {
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
              <ChatAttachment key={attachment.id} attachment={attachment} />
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

function ChatAttachment({ attachment }: { attachment: LocalAttachment }) {
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
      <li>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={attachment.fileName} className="chat-media" />
      </li>
    );
  }
  return <li>{attachment.fileName}</li>;
}

function AgentBubble({ enrichment }: { enrichment: ThreadEnrichment }) {
  return (
    <article
      className="chat-turn chat-turn-agent"
      data-testid="chat-turn-agent"
      aria-label={`Walking Thoughts reply · ${enrichment.model}`}
    >
      <div className="chat-bubble chat-bubble-agent">
        <p>{enrichment.text}</p>
        {enrichment.sources.length > 0 ? (
          <ul className="enrichment-sources" aria-label="Sources">
            {enrichment.sources.map((source) => (
              <li key={`${source.url}-${source.retrievedAt}`}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="chat-meta">
        <span>Walking Thoughts</span>
        <span className="capture-status status-complete">Reply</span>
        <span className="enrichment-model">{enrichment.model}</span>
        <time dateTime={enrichment.createdAt}>
          {new Date(enrichment.createdAt).toLocaleTimeString()}
        </time>
      </div>
    </article>
  );
}

/**
 * Chat-style Thread surface: Captures (You) and Enrichments (Walking Thoughts)
 * as conversation turns, with a sticky follow-up composer wired through
 * local commit → sync → Enrichment.
 */
export function ThreadChat({ threadId, embedded = false, onClose }: ThreadChatProps) {
  const [thread, setThread] = useState<LocalThread | null>(null);
  const [captures, setCaptures] = useState<LocalCapture[]>([]);
  const [enrichments, setEnrichments] = useState<ThreadEnrichment[]>([]);
  const [draft, setDraft] = useState("");
  const [media, setMedia] = useState<AttachmentInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const logRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  // Keep pulling while Enrichment is in flight so the reply lands in-chat.
  useEffect(() => {
    if (!isEnriching || !online) return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          await runSyncCycle({ store: getCaptureStore() });
          await refresh();
        } catch {
          // Retryable; the enriching gutter stays visible.
        }
      })();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [isEnriching, online, refresh]);

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [captures, enrichments, isEnriching]);

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
          // Statuses remain visible on turns.
        }
        await refresh();
      }
    } catch {
      setError("Could not send the follow-up Capture");
    } finally {
      setBusy(false);
    }
  }

  const timeline = chronologicalThreadEntries(captures, enrichments);

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
              ? "Replies arrive here after Enrichment"
              : "Offline — Captures save on this device"}
            {thread ? ` · rev ${thread.revision}` : null}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            className="journal-close"
            aria-label="Close Thread chat"
            onClick={onClose}
          >
            ✕
          </button>
        ) : (
          <Link className="topbar-link" href="/">
            Trail
          </Link>
        )}
      </header>

      <div
        ref={logRef}
        className="thread-chat-log"
        role="log"
        aria-label="Thread conversation"
        aria-live="polite"
      >
        {timeline.map((entry) =>
          entry.kind === "capture" ? (
            <CaptureBubble key={entry.capture.id} capture={entry.capture} />
          ) : (
            <AgentBubble key={entry.enrichment.id} enrichment={entry.enrichment} />
          ),
        )}
        {isEnriching ? (
          <article
            className="chat-turn chat-turn-agent"
            data-testid="chat-turn-pending"
            aria-label="Walking Thoughts is preparing a reply"
          >
            <div className="chat-bubble chat-bubble-agent chat-pending">
              <span className="thread-speaker">Walking Thoughts</span>
              <p>Preparing a reply…</p>
            </div>
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
          Follow-up Capture
        </label>
        <textarea
          id="thread-chat-followup"
          rows={2}
          value={draft}
          placeholder="Continue the conversation…"
          onChange={(event) => setDraft(event.target.value)}
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        {media.length > 0 ? (
          <ul className="capture-attachment-drafts" aria-label="Selected media">
            {media.map((attachment, index) => (
              <li key={`${attachment.fileName}-${index}`}>
                {attachment.fileName}
                <button
                  type="button"
                  className="capture-retry"
                  onClick={() =>
                    setMedia((current) =>
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
        <div className="thread-chat-actions">
          <button
            type="button"
            className="capture-retry"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            Add media
          </button>
          <input
            ref={fileRef}
            className="capture-file-input"
            type="file"
            accept="image/*,audio/*,video/*"
            multiple
            aria-label="Add follow-up media"
            onChange={(event) => {
              const files = event.target.files;
              if (!files?.length) return;
              setMedia((current) => [
                ...current,
                ...Array.from(files).map((file) => ({
                  kind: kindFromMime(file.type || "application/octet-stream"),
                  mimeType: file.type || "application/octet-stream",
                  fileName: file.name || "attachment",
                  bytes: file,
                })),
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
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </footer>
    </div>
  );
}
