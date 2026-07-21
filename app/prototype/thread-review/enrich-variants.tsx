"use client";

/**
 * PROTOTYPE — Enrich area: how should a single Enrichment read?
 * The premise: enrichment = remember + annotate. The model researches the
 * Capture (web search via Exa/Firecrawl-style tools), answers in markdown,
 * cites what it read, and leaves follow-ups.
 *
 * A — Annotation card: markdown card under the Capture, trace folded away
 * B — Margin notes: the answer broken into short notes pinned to your words
 * C — Research dossier: the work shown first — trace, quotes, then findings
 */

import { REVIEW_THREAD } from "./fixture";
import { ProtoMarkdown } from "./markdown";
import {
  CaptureMeta,
  FollowUpList,
  PhotoTile,
  ResearchTrace,
  SourceChips,
} from "./shared";

export const ENRICH_VARIANTS = [
  { key: "A", label: "Annotation card" },
  { key: "B", label: "Margin notes" },
  { key: "C", label: "Research dossier" },
];

const SUBJECT = REVIEW_THREAD.captures[0];
const ENRICHMENT = SUBJECT.enrichment!;

function SubjectCapture() {
  return (
    <article className="tr-subject">
      <p className="tr-words">{SUBJECT.text}</p>
      <div className="tr-photo-row">
        {SUBJECT.photos.map((photo) => (
          <PhotoTile key={photo.id} photo={photo} size="md" />
        ))}
      </div>
      <CaptureMeta capture={SUBJECT} />
    </article>
  );
}

function EnrichShell({ children, note }: { children: React.ReactNode; note: string }) {
  return (
    <div className="proto-shell tr-shell">
      <header className="tr-header">
        <a className="tr-back" href="#thread" onClick={(event) => event.preventDefault()}>
          ← {REVIEW_THREAD.title}
        </a>
        <h1>One Capture, enriched</h1>
        <p className="tr-header-sub">{note}</p>
      </header>
      <div className="tr-enrich-stage">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A — Annotation card                                                 */
/* ------------------------------------------------------------------ */

export function EnrichA() {
  return (
    <EnrichShell note="Markdown card under your words · research trace folded away">
      <SubjectCapture />
      <article className="tr-card">
        <header className="tr-card-head">
          <span className="tr-annotation-mark">✦</span>
          <span>Annotation</span>
          <span className="tr-model">{ENRICHMENT.model}</span>
        </header>
        <ProtoMarkdown markdown={ENRICHMENT.markdown} />
        <SourceChips sources={ENRICHMENT.sources} />
        <ResearchTrace steps={ENRICHMENT.research} />
        <FollowUpList enrichment={ENRICHMENT} />
      </article>
    </EnrichShell>
  );
}

/* ------------------------------------------------------------------ */
/* B — Margin notes                                                    */
/* ------------------------------------------------------------------ */

const MARGIN_NOTES = [
  {
    anchor: "Who stacked these",
    note: "Sheep-boom era farmers, roughly **1810–1840** — CT highlands were ~70% cleared pasture by 1850.",
    source: 1,
  },
  {
    anchor: "straight downhill",
    note: "Straight single-stacked style = a *boundary* wall, not livestock containment.",
    source: 1,
  },
  {
    anchor: "into the reservoir",
    note: "The wall predates the water: this valley was dammed around **1912** for the mill towns downstream.",
    source: 3,
  },
];

export function EnrichB() {
  return (
    <EnrichShell note="Short notes pinned to phrases in your Capture · tap a marker to jump">
      <article className="tr-subject tr-subject-annotated">
        <p className="tr-words">
          Stone wall running{" "}
          <mark>
            straight downhill<sup>2</sup>
          </mark>{" "}
          <mark>
            into the reservoir<sup>3</sup>
          </mark>
          .{" "}
          <mark>
            Who stacked these<sup>1</sup>
          </mark>
          , and when?
        </p>
        <div className="tr-photo-row">
          {SUBJECT.photos.map((photo) => (
            <PhotoTile key={photo.id} photo={photo} size="sm" />
          ))}
        </div>
        <CaptureMeta capture={SUBJECT} />
      </article>
      <ol className="tr-margin-notes">
        {MARGIN_NOTES.map((item, index) => (
          <li key={index}>
            <span className="tr-margin-key">{index + 1}</span>
            <div>
              <p className="tr-margin-anchor">“{item.anchor}”</p>
              <ProtoMarkdown markdown={item.note} />
              <a
                className="tr-margin-source"
                href={ENRICHMENT.sources[item.source - 1]?.url}
                target="_blank"
                rel="noreferrer"
              >
                {ENRICHMENT.sources[item.source - 1]?.title}
              </a>
            </div>
          </li>
        ))}
      </ol>
      <FollowUpList enrichment={ENRICHMENT} />
    </EnrichShell>
  );
}

/* ------------------------------------------------------------------ */
/* C — Research dossier                                                */
/* ------------------------------------------------------------------ */

export function EnrichC() {
  return (
    <EnrichShell note="The work shown first — searches, page reads, then findings">
      <SubjectCapture />
      <article className="tr-card tr-dossier">
        <header className="tr-card-head">
          <span className="tr-annotation-mark">⌕</span>
          <span>Research dossier</span>
          <span className="tr-model">{ENRICHMENT.model}</span>
        </header>
        <ResearchTrace steps={ENRICHMENT.research} open />
        <h4 className="tr-dossier-title">Findings</h4>
        <ProtoMarkdown markdown={ENRICHMENT.markdown} />
        <h4 className="tr-dossier-title">Read in full</h4>
        <SourceChips sources={ENRICHMENT.sources} />
        <h4 className="tr-dossier-title">Left for next time</h4>
        <FollowUpList enrichment={ENRICHMENT} />
      </article>
    </EnrichShell>
  );
}
