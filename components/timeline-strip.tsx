"use client";

import { useEffect, useState } from "react";
import { calendarDayKey } from "@/lib/local-capture/calendar-day";
import { createIdbMediaStore } from "@/lib/local-capture/media-store";
import {
  SPOT_RADIUS_METERS,
  type TimelineFrame,
  type TimelineSpot,
} from "@/lib/map-journal/timeline-spots";

function frameDayLabel(frame: TimelineFrame): string {
  if (frame.dayKey === calendarDayKey()) return "Today";
  const [year, month, day] = frame.dayKey.split("-").map(Number);
  if (!year || !month || !day) return frame.dayKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** The frame's photo from local media, offline like the rest of the journal. */
function FramePhoto({ frame }: { frame: TimelineFrame }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const key = frame.localObjectKey ?? frame.thumbnailObjectKey;
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
  }, [frame.localObjectKey, frame.thumbnailObjectKey]);

  if (!url) {
    return (
      <span className="timeline-frame-placeholder" aria-hidden="true">
        {frame.fileName}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- local blob URL
  return <img className="timeline-frame-photo" src={url} alt={frame.fileName} />;
}

/**
 * The same-spot strip (docs/desk.md, D2): every frame the walker has routed
 * here, in day order — the "morning cow, day 41" view. Removing a frame is
 * the only edit; the Thread it came from is not touched.
 */
export function TimelineStrip({
  spot,
  onRemoveFrame,
  onClose,
}: {
  spot: TimelineSpot;
  onRemoveFrame: (captureId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="timeline-strip" data-testid="timeline-strip">
      <div className="journal-panel-head">
        <div>
          <h2 data-testid="timeline-strip-title">
            {spot.name}, day {spot.dayCount}
          </h2>
          <p className="journal-place">
            Same spot within {SPOT_RADIUS_METERS} m · {spot.frames.length}{" "}
            {spot.frames.length === 1 ? "frame" : "frames"}
          </p>
        </div>
        <button
          type="button"
          className="journal-close"
          aria-label="Close Timeline strip"
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
      </div>
      <ol className="timeline-frames" aria-label="Frames in day order">
        {spot.frames.map((frame) => (
          <li
            key={frame.captureId}
            className="timeline-frame"
            data-testid={`timeline-frame-${frame.captureId}`}
          >
            <FramePhoto frame={frame} />
            <div className="timeline-frame-meta">
              <span>{frameDayLabel(frame)}</span>
              <span data-testid={`timeline-frame-distance-${frame.captureId}`}>
                {frame.distanceMeters} m
              </span>
            </div>
            <button
              type="button"
              className="timeline-frame-remove"
              data-testid={`timeline-frame-remove-${frame.captureId}`}
              onClick={() => onRemoveFrame(frame.captureId)}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      <p className="journal-note" role="note">
        Removing a frame only takes it off this strip — the Thread keeps its
        Capture.
      </p>
    </div>
  );
}
