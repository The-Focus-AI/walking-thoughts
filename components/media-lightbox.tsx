"use client";

import { useEffect, useRef, useState } from "react";
import { createIdbMediaStore } from "@/lib/local-capture/media-store";
import type { LocalAttachment } from "@/lib/local-capture/types";

/**
 * Something lookable for an attachment: the retained thumbnail or the local
 * original from this phone's store, else the private server copy. A video
 * has no lookable thumbnail unless one was retained, so its thumb falls
 * through to null rather than decoding the whole clip for a 44px square.
 */
export function useAttachmentUrl(
  attachment: LocalAttachment,
  prefer: "thumbnail" | "original",
): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const key =
    prefer === "thumbnail"
      ? (attachment.thumbnailObjectKey ??
        (attachment.kind === "image" ? attachment.localObjectKey : null))
      : (attachment.localObjectKey ?? attachment.thumbnailObjectKey);

  useEffect(() => {
    if (!key) return;
    let objectUrl: string | null = null;
    let active = true;
    void createIdbMediaStore()
      .get(key)
      .then((blob) => {
        if (!blob || !active) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  if (blobUrl) return blobUrl;
  // Captured on another device: stream the private server copy. As a thumb
  // that only makes sense for an image — the element would be an <img>.
  if (!key && attachment.remoteObjectKey) {
    if (prefer === "original" || attachment.kind === "image") {
      return `/api/media/${attachment.id}`;
    }
  }
  return null;
}

/** A 44px tap target that says what the media is and opens it in place. */
export function AttachmentThumb({
  attachment,
  onOpen,
}: {
  attachment: LocalAttachment;
  onOpen: () => void;
}) {
  const url = useAttachmentUrl(attachment, "thumbnail");
  return (
    <button
      type="button"
      className="thread-thumb"
      data-testid="thread-thumb"
      aria-label={`Open ${attachment.fileName}`}
      title={attachment.fileName}
      onClick={onOpen}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob or private media URL
        <img src={url} alt="" />
      ) : (
        <span aria-hidden="true">{attachment.kind === "video" ? "▶" : "▤"}</span>
      )}
    </button>
  );
}

/**
 * A photo or clip read without leaving the desk — the same frame the
 * published reports use, holding the media instead of a page.
 */
export function MediaLightbox({
  attachment,
  onClose,
}: {
  attachment: LocalAttachment;
  onClose: () => void;
}) {
  const url = useAttachmentUrl(attachment, "original");
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<Element | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // The desk behind must not scroll while media is open over it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (restoreRef.current instanceof HTMLElement) restoreRef.current.focus();
    };
  }, [onClose]);

  return (
    <div
      className="artifact-lightbox"
      data-testid="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Media · ${attachment.fileName}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="artifact-lightbox-frame">
        <header className="artifact-lightbox-bar">
          <div className="artifact-lightbox-name">
            <span className="artifact-lightbox-eyebrow">Media</span>
            <span className="artifact-lightbox-title">
              {attachment.fileName}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="artifact-lightbox-close"
            aria-label="Close media"
            data-testid="media-lightbox-close"
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
        </header>
        <div className="media-lightbox-body">
          {url && attachment.kind === "video" ? (
            <video
              className="media-lightbox-media"
              src={url}
              controls
              autoPlay
            />
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob or private media URL
            <img
              className="media-lightbox-media"
              src={url}
              alt={attachment.fileName}
            />
          ) : (
            <p className="media-lightbox-empty">
              This media is not on this phone — it stays with the Capture that
              took it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
