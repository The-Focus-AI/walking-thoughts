"use client";

import { useEffect, useState } from "react";
import type { AttachmentInput } from "@/lib/local-capture/types";

function DraftPreview({ attachment }: { attachment: AttachmentInput }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob =
      attachment.bytes instanceof Blob
        ? attachment.bytes
        : new Blob([attachment.bytes as BlobPart], {
            type: attachment.mimeType,
          });
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment.bytes, attachment.mimeType]);

  if (!url) {
    return <span className="attachment-draft-name">{attachment.fileName}</span>;
  }
  if (attachment.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local draft blob
      <img className="media-preview" src={url} alt={attachment.fileName} />
    );
  }
  if (attachment.kind === "audio") {
    return <audio className="media-preview" src={url} controls />;
  }
  return (
    <video className="media-preview" src={url} controls playsInline />
  );
}

/** Pending photo/audio/video drafts before Capture. */
export function AttachmentDrafts({
  attachments,
  onRemove,
}: {
  attachments: AttachmentInput[];
  onRemove: (index: number) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul className="capture-attachment-drafts" aria-label="Selected media">
      {attachments.map((attachment, index) => (
        <li key={`${attachment.fileName}-${index}`} className="attachment-draft">
          <DraftPreview attachment={attachment} />
          <div className="attachment-draft-meta">
            <span className="attachment-draft-name">
              {attachment.fileName} · {attachment.kind}
            </span>
            <button
              type="button"
              className="capture-retry"
              onClick={() => onRemove(index)}
            >
              Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
