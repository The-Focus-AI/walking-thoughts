"use client";

/**
 * PROTOTYPE — Review area: what should the Thread page look like when you
 * come back after the walk to go over notes, photos, and follow-ups?
 *
 * A — Field ledger: dense journal; your words primary, annotations fold open
 * B — Split lanes: my words vs annotations as parallel lanes, with filters
 * C — Recap first: photo grid + follow-up checklist on top, transcript below
 */

import { useState } from "react";
import {
  REVIEW_THREAD,
  allPhotos,
  openFollowUps,
  reviewStats,
  timeOf,
  type ProtoCapture,
} from "./fixture";
import { ProtoMarkdown } from "./markdown";
import {
  AudioStub,
  CaptureMeta,
  FollowUpList,
  PhotoTile,
  ResearchTrace,
  ReviewComposer,
  SourceChips,
} from "./shared";

export const REVIEW_VARIANTS = [
  { key: "A", label: "Field ledger" },
  { key: "B", label: "Split lanes" },
  { key: "C", label: "Recap first" },
];

function ThreadHeader({ subtitle }: { subtitle: string }) {
  const thread = REVIEW_THREAD;
  const stats = reviewStats(thread);
  return (
    <header className="tr-header">
      <a className="tr-back" href="#threads" onClick={(event) => event.preventDefault()}>
        ← Threads
      </a>
      <h1>{thread.title}</h1>
      <p className="tr-header-sub">
        {new Date(`${thread.walkedOn}T12:00:00`).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
        {" · "}
        {thread.region} · {thread.distanceKm} km · {subtitle}
      </p>
      <ul className="tr-stats" aria-label="Thread stats">
        <li>
          <strong>{stats.captures}</strong> captures
        </li>
        <li>
          <strong>{stats.photos}</strong> photos
        </li>
        <li>
          <strong>{stats.annotated}</strong> annotated
        </li>
        <li className={stats.followUps > 0 ? "tr-stat-hot" : undefined}>
          <strong>{stats.followUps}</strong> follow-ups
        </li>
      </ul>
    </header>
  );
}

function CaptureBody({ capture }: { capture: ProtoCapture }) {
  return (
    <>
      {capture.kind === "audio" ? (
        <>
          <AudioStub label={capture.text} />
          {capture.transcript ? (
            <p className="tr-transcript">“{capture.transcript}”</p>
          ) : null}
        </>
      ) : (
        <p className="tr-words">{capture.text}</p>
      )}
      {capture.photos.length > 0 ? (
        <div className="tr-photo-row">
          {capture.photos.map((photo) => (
            <PhotoTile key={photo.id} photo={photo} size="sm" />
          ))}
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* A — Field ledger                                                    */
/* ------------------------------------------------------------------ */

export function ReviewA() {
  const thread = REVIEW_THREAD;
  return (
    <div className="proto-shell tr-shell">
      <ThreadHeader subtitle="ledger view" />
      <ol className="tr-ledger">
        {thread.captures.map((capture) => (
          <li key={capture.id} className="tr-ledger-row">
            <div className="tr-ledger-gutter">
              <time dateTime={capture.createdAt}>{timeOf(capture.createdAt)}</time>
              {capture.isFollowUp ? <span className="tr-gutter-followup">↳</span> : null}
            </div>
            <div className="tr-ledger-main">
              <CaptureBody capture={capture} />
              <CaptureMeta capture={capture} />
              {capture.enrichment ? (
                <details className="tr-annotation">
                  <summary>
                    <span className="tr-annotation-mark">✦</span>
                    Annotation · {capture.enrichment.sources.length} source
                    {capture.enrichment.sources.length === 1 ? "" : "s"}
                    {capture.enrichment.followUps.length > 0
                      ? ` · ${capture.enrichment.followUps.length} follow-up${
                          capture.enrichment.followUps.length === 1 ? "" : "s"
                        }`
                      : ""}
                  </summary>
                  <div className="tr-annotation-body">
                    <ProtoMarkdown markdown={capture.enrichment.markdown} />
                    <SourceChips sources={capture.enrichment.sources} />
                    <ResearchTrace steps={capture.enrichment.research} />
                    <FollowUpList enrichment={capture.enrichment} compact />
                  </div>
                </details>
              ) : capture.status === "enriching" ? (
                <p className="tr-pending">✦ Researching this…</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <ReviewComposer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* B — Split lanes                                                     */
/* ------------------------------------------------------------------ */

const LANE_FILTERS = [
  { key: "all", label: "Everything" },
  { key: "mine", label: "My words" },
  { key: "annotations", label: "Annotations" },
  { key: "followups", label: "Follow-ups" },
] as const;

type LaneFilter = (typeof LANE_FILTERS)[number]["key"];

export function ReviewB() {
  const thread = REVIEW_THREAD;
  const [filter, setFilter] = useState<LaneFilter>("all");
  const captures = thread.captures.filter((capture) => {
    if (filter === "annotations") return Boolean(capture.enrichment);
    if (filter === "followups")
      return (capture.enrichment?.followUps.length ?? 0) > 0;
    return true;
  });
  const showMine = filter !== "annotations";
  const showAnnotations = filter !== "mine";
  return (
    <div className="proto-shell tr-shell">
      <ThreadHeader subtitle="split lanes" />
      <div className="tr-filters" role="tablist" aria-label="Filter Thread">
        {LANE_FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={filter === option.key}
            className={filter === option.key ? "tr-filter active" : "tr-filter"}
            onClick={() => setFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <ol className="tr-lanes">
        {captures.map((capture) => (
          <li key={capture.id} className="tr-lane-row">
            {showMine ? (
              <div className="tr-lane tr-lane-you">
                <CaptureBody capture={capture} />
                <CaptureMeta capture={capture} />
              </div>
            ) : null}
            {showAnnotations ? (
              <div className="tr-lane tr-lane-notes">
                {capture.enrichment ? (
                  <>
                    <p className="tr-lane-label">✦ {capture.enrichment.model}</p>
                    <ProtoMarkdown markdown={capture.enrichment.markdown} />
                    <SourceChips sources={capture.enrichment.sources} />
                    <FollowUpList enrichment={capture.enrichment} compact />
                  </>
                ) : capture.status === "enriching" ? (
                  <p className="tr-pending">Researching…</p>
                ) : (
                  <p className="tr-lane-empty">No annotation yet</p>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      <ReviewComposer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* C — Recap first                                                     */
/* ------------------------------------------------------------------ */

export function ReviewC() {
  const thread = REVIEW_THREAD;
  const photos = allPhotos(thread);
  const followUps = openFollowUps(thread);
  return (
    <div className="proto-shell tr-shell">
      <ThreadHeader subtitle="recap view" />
      <section className="tr-recap" aria-label="Walk recap">
        <div className="tr-recap-photos">
          {photos.map((photo) => (
            <PhotoTile key={photo.id} photo={photo} size="md" />
          ))}
        </div>
        <div className="tr-recap-followups">
          <h2>Follow-ups from this walk</h2>
          <ul>
            {followUps.map((item, index) => (
              <li key={index}>
                <span className="tr-followup-box" aria-hidden="true" />
                <span>{item.text}</span>
                <a href={`#c-${item.captureId}`} className="tr-followup-jump">
                  #{item.sequence}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <h2 className="tr-transcript-title">The walk, in order</h2>
      <ol className="tr-recap-transcript">
        {thread.captures.map((capture) => (
          <li key={capture.id} id={`c-${capture.id}`} className="tr-recap-row">
            <CaptureBody capture={capture} />
            <CaptureMeta capture={capture} />
            {capture.enrichment ? (
              <aside className="tr-recap-note">
                <ProtoMarkdown markdown={capture.enrichment.markdown} />
                <SourceChips sources={capture.enrichment.sources} />
              </aside>
            ) : null}
          </li>
        ))}
      </ol>
      <ReviewComposer />
    </div>
  );
}
