"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { artifactHref } from "@/lib/artifacts/client";
import type { ArtifactSummary } from "@/lib/artifacts/types";

/** The desk split-view breakpoint: the processing room, where a page fits. */
export const ARTIFACT_LIGHTBOX_MIN_WIDTH = 960;

/**
 * Whether this viewport is the processing room. The phone is the field
 * instrument — a report framed inside a 412px column is worse than the page
 * itself, so there an Artifact opens as a page and this stays false. Server
 * render and first paint assume the phone; the effect corrects it.
 */
export function useDeskViewport(): boolean {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(
      `(min-width: ${ARTIFACT_LIGHTBOX_MIN_WIDTH}px)`,
    );
    const apply = () => setDesk(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return desk;
}

/**
 * A published report read without leaving the desk. The page is framed
 * rather than inlined: it is model-authored HTML under its own script-free
 * policy, and framing keeps that boundary intact instead of letting an
 * Artifact's markup and the app's stylesheet share one document. The frame
 * is sandboxed on top of that — `allow-same-origin` only so the sheet's
 * self-hosted display font resolves, and `allow-popups` so the report's
 * source citations still open. Scripts stay off in both layers.
 */
export function ArtifactLightbox({
  artifact,
  onClose,
}: {
  artifact: ArtifactSummary;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreRef = useRef<Element | null>(null);
  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    restoreRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    // The desk behind must not scroll while a page is open over it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (restoreRef.current instanceof HTMLElement) restoreRef.current.focus();
    };
  }, [close]);

  return (
    <div
      className="artifact-lightbox"
      data-testid="artifact-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Report · ${artifact.title}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="artifact-lightbox-frame">
        <header className="artifact-lightbox-bar">
          <div className="artifact-lightbox-name">
            <span className="artifact-lightbox-eyebrow">Report</span>
            <span className="artifact-lightbox-title">{artifact.title}</span>
          </div>
          <a
            className="artifact-lightbox-out"
            href={artifactHref(artifact.id)}
            target="_blank"
            rel="noreferrer"
            data-testid="artifact-lightbox-out"
          >
            Open as page
          </a>
          <button
            ref={closeRef}
            type="button"
            className="artifact-lightbox-close"
            aria-label="Close report"
            data-testid="artifact-lightbox-close"
            onClick={close}
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
        <iframe
          className="artifact-lightbox-page"
          src={artifactHref(artifact.id)}
          title={`Report · ${artifact.title}`}
          data-testid="artifact-lightbox-page"
          sandbox="allow-same-origin allow-popups"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
