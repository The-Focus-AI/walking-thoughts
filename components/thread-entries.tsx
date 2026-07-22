"use client";

import { useEffect, useState } from "react";
import { createIdbMediaStore } from "@/lib/local-capture/media-store";
import type {
  CaptureSyncStatus,
  LocalAttachment,
  LocalCapture,
} from "@/lib/local-capture/types";

export function statusLabel(status: CaptureSyncStatus): string {
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

/** Locally stored media rendered inline: image, audio, or video preview. */
function AttachmentPreview({ attachment }: { attachment: LocalAttachment }) {
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

  if (!url) return null;
  if (attachment.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- local blob URL
    return <img className="media-preview" src={url} alt={attachment.fileName} />;
  }
  if (attachment.kind === "audio") {
    return <audio className="media-preview" src={url} controls />;
  }
  return <video className="media-preview" src={url} controls playsInline />;
}

/** Read-only Capture entry: status, chronology, text, and media. */
export function CaptureEntryView({
  capture,
  mediaPreviews = false,
  showSpeaker = false,
}: {
  capture: LocalCapture;
  mediaPreviews?: boolean;
  /** When true, label the entry as a walker message in the Thread stream. */
  showSpeaker?: boolean;
}) {
  const label =
    capture.text ||
    capture.attachments.map((attachment) => attachment.fileName).join(", ") ||
    "Capture";

  return (
    <article
      className={`capture-entry${showSpeaker ? " thread-speaker-you" : ""}`}
      aria-label={label}
    >
      <div className="capture-entry-meta">
        {showSpeaker ? (
          <span className="thread-speaker">You</span>
        ) : null}
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
            <li key={attachment.id}>
              {attachment.fileName} · {attachment.kind} ·{" "}
              {statusLabel(attachment.syncStatus)}
              {mediaPreviews ? (
                <AttachmentPreview attachment={attachment} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {capture.status === "needs_attention" ? (
        <div className="capture-attention">
          <span>{capture.syncReason ?? "Synchronization failed"}</span>
        </div>
      ) : null}
    </article>
  );
}

