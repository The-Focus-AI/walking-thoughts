"use client";

/**
 * PROTOTYPE — shared building blocks for thread-review variants.
 */

import {
  statusLabel,
  timeOf,
  type ProtoCapture,
  type ProtoEnrichment,
  type ProtoPhoto,
  type ProtoResearchStep,
  type ProtoSource,
} from "./fixture";

export function PhotoTile({
  photo,
  size = "md",
}: {
  photo: ProtoPhoto;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <figure
      className={`tr-photo tr-photo-${size}`}
      role="img"
      aria-label={photo.label}
      style={{ background: photo.tone }}
    >
      <figcaption>{photo.label}</figcaption>
    </figure>
  );
}

export function StatusChip({ capture }: { capture: ProtoCapture }) {
  return (
    <span className={`tr-status tr-status-${capture.status}`}>
      {statusLabel(capture.status)}
    </span>
  );
}

export function CaptureMeta({ capture }: { capture: ProtoCapture }) {
  return (
    <div className="tr-capture-meta">
      <span className="tr-seq">#{capture.sequence}</span>
      <time dateTime={capture.createdAt}>{timeOf(capture.createdAt)}</time>
      {capture.place ? <span>{capture.place}</span> : null}
      {capture.isFollowUp ? <span className="tr-followup-tag">follow-up</span> : null}
      <StatusChip capture={capture} />
    </div>
  );
}

export function AudioStub({ label }: { label: string }) {
  return (
    <div className="tr-audio" aria-label={`Audio: ${label}`}>
      <span className="tr-audio-play" aria-hidden="true">
        ▶
      </span>
      <span className="tr-audio-wave" aria-hidden="true">
        ▁▂▅▃▇▄▂▆▃▁▄▆▂▅▁▃
      </span>
      <span className="tr-audio-label">{label}</span>
    </div>
  );
}

export function SourceChips({ sources }: { sources: ProtoSource[] }) {
  if (sources.length === 0) return null;
  return (
    <ul className="tr-sources" aria-label="Sources">
      {sources.map((source, index) => (
        <li key={source.url + index}>
          <a href={source.url} target="_blank" rel="noreferrer">
            <span className="tr-source-index">{index + 1}</span>
            {source.title}
          </a>
          {source.note ? <em>{source.note}</em> : null}
        </li>
      ))}
    </ul>
  );
}

const TOOL_LABEL: Record<ProtoResearchStep["tool"], string> = {
  exa: "Exa",
  firecrawl: "Firecrawl",
  model: "Model",
};

export function ResearchTrace({
  steps,
  open = false,
}: {
  steps: ProtoResearchStep[];
  open?: boolean;
}) {
  if (steps.length === 0) return null;
  const searches = steps.filter((step) => step.tool === "exa").length;
  const reads = steps.filter((step) => step.tool === "firecrawl").length;
  return (
    <details className="tr-trace" open={open}>
      <summary>
        Research · {searches} search{searches === 1 ? "" : "es"} · {reads} page
        {reads === 1 ? "" : "s"} read
      </summary>
      <ol>
        {steps.map((step, index) => (
          <li key={index}>
            <span className={`tr-tool tr-tool-${step.tool}`}>
              {TOOL_LABEL[step.tool]}
            </span>
            <span className="tr-trace-action">{step.action}</span>
            <span className="tr-trace-detail">{step.detail}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function FollowUpList({
  enrichment,
  compact = false,
}: {
  enrichment: ProtoEnrichment;
  compact?: boolean;
}) {
  if (enrichment.followUps.length === 0) return null;
  return (
    <ul className={compact ? "tr-followups compact" : "tr-followups"}>
      {enrichment.followUps.map((item, index) => (
        <li key={index}>
          <span className="tr-followup-box" aria-hidden="true" />
          <span>{item}</span>
          <button type="button" className="tr-followup-ask">
            Ask
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Capture entry point for review surfaces: a new Capture starts a new
 * Thread by default; replying into this Thread is the explicit secondary.
 */
export function ReviewComposer() {
  return (
    <footer className="tr-composer" aria-label="Add a Capture">
      <button type="button" className="tr-composer-new">
        ＋ New Capture
        <small>starts its own Thread</small>
      </button>
      <button type="button" className="tr-composer-reply">
        ↳ Reply in this Thread
      </button>
    </footer>
  );
}
