"use client";

/**
 * PROTOTYPE — shared state model + small blocks for desk-inbox variants.
 *
 * The state model is the question under test: Thread `reviewed` is separate
 * from the Enrichment's fate (`kept` / `dismissed`), so research can be kept
 * while the note itself is processed.
 */

import { useMemo, useState } from "react";
import {
  formatBytes,
  pastThread,
  projectName,
  QUEUE,
  type ProtoKind,
  type ProtoMedia,
  type ProtoQueueThread,
  type ProtoRelated,
} from "./fixture";

export type ResearchVerdict = "kept" | "dismissed" | null;

export type Filing = {
  reviewed: boolean;
  kind: ProtoKind;
  projectId: string | null;
  research: ResearchVerdict;
};

export type DeskState = Record<string, Filing>;

export type DeskActions = {
  state: DeskState;
  setKind(threadId: string, kind: ProtoKind): void;
  setProject(threadId: string, projectId: string | null): void;
  setResearch(threadId: string, verdict: ResearchVerdict): void;
  setReviewed(threadId: string, reviewed: boolean): void;
  /** File in one gesture: settle research verdict and mark reviewed. */
  fileThread(threadId: string, verdict: ResearchVerdict): void;
};

export function useDeskState(): DeskActions {
  const [state, setState] = useState<DeskState>(() =>
    Object.fromEntries(
      QUEUE.map((thread) => [
        thread.id,
        {
          reviewed: false,
          kind: thread.kindGuess,
          projectId: thread.projectGuess ?? null,
          research: null as ResearchVerdict,
        },
      ]),
    ),
  );

  return useMemo<DeskActions>(() => {
    function patch(threadId: string, part: Partial<Filing>) {
      setState((prev) => ({
        ...prev,
        [threadId]: { ...prev[threadId], ...part },
      }));
    }
    return {
      state,
      setKind: (id, kind) => patch(id, { kind }),
      setProject: (id, projectId) => patch(id, { projectId }),
      setResearch: (id, research) => patch(id, { research }),
      setReviewed: (id, reviewed) => patch(id, { reviewed }),
      fileThread: (id, research) => patch(id, { research, reviewed: true }),
    };
  }, [state]);
}

/** Skill rule: surface the state — running tally shown in every variant. */
export function StateReadout({ state }: { state: DeskState }) {
  const filings = Object.values(state);
  const remaining = filings.filter((filing) => !filing.reviewed).length;
  const kept = filings.filter((filing) => filing.research === "kept").length;
  const dismissed = filings.filter(
    (filing) => filing.research === "dismissed",
  ).length;
  return (
    <div className="di-readout" role="status">
      <span>
        <strong>{remaining}</strong> in queue
      </span>
      <span>
        <strong>{kept}</strong> research kept
      </span>
      <span>
        <strong>{dismissed}</strong> dismissed
      </span>
      <span>
        <strong>{filings.length - remaining}</strong> reviewed
      </span>
    </div>
  );
}

export function KindChip({ kind }: { kind: ProtoKind }) {
  return <span className={`di-kind di-kind-${kind}`}>{kind}</span>;
}

export function MediaTile({
  media,
  size = "md",
  ringed = false,
}: {
  media: ProtoMedia;
  size?: "sm" | "md" | "lg";
  ringed?: boolean;
}) {
  const badge =
    media.type === "audio" ? "▶ audio" : media.type === "video" ? "▶ video" : null;
  return (
    <figure
      className={`di-media di-media-${size}${ringed ? " ringed" : ""}`}
      role="img"
      aria-label={media.label}
      style={{ background: media.tone }}
    >
      {badge ? <span className="di-media-badge">{badge}</span> : null}
      <figcaption>{media.label}</figcaption>
    </figure>
  );
}

export function SimilarList({
  related,
  compact = false,
}: {
  related: ProtoRelated[];
  compact?: boolean;
}) {
  if (related.length === 0)
    return <p className="di-similar-empty">No earlier mentions — first sighting.</p>;
  return (
    <ul className={compact ? "di-similar compact" : "di-similar"}>
      {related.map((link) => {
        const past = pastThread(link.threadId);
        if (!past) return null;
        return (
          <li key={link.threadId}>
            <span className="di-similar-score">
              {Math.round(link.score * 100)}%
            </span>
            <div className="di-similar-body">
              <span className="di-similar-title">{past.title}</span>
              <span className="di-similar-meta">
                {past.walkedOn}
                {link.sharedMention ? (
                  <>
                    {" · via "}
                    <em>{link.sharedMention}</em>
                  </>
                ) : null}
                {projectName(past.projectId) ? (
                  <> · {projectName(past.projectId)}</>
                ) : null}
              </span>
              {!compact ? <span className="di-similar-note">{past.note}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function mediaTotals(threads: ProtoQueueThread[]) {
  const all = threads.flatMap((thread) => thread.media);
  const bytes = all.reduce((sum, media) => sum + media.bytes, 0);
  const count = (type: ProtoMedia["type"]) =>
    all.filter((media) => media.type === type).length;
  return {
    total: all.length,
    photos: count("photo"),
    audio: count("audio"),
    video: count("video"),
    size: formatBytes(bytes),
  };
}
