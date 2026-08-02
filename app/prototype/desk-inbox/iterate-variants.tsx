"use client";

/**
 * PROTOTYPE — round-2 desk-inbox variants, from feedback on A–C:
 * keep A's keyboard, calm C's density, add back-and-forth and regrouping.
 *
 * D — Lens desk    : one grouping control (Days / Topics / Kind / Media / Reports)
 *                    re-groups the same queue; expandable rows; A's keys kept
 * E — Dialogue desk: the Thread as a conversation you keep asking into;
 *                    filing is a compact header bar
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DAYS,
  dayOf,
  KINDS,
  QUEUE,
  timeOf,
  topicOf,
  type ProtoQueueThread,
} from "./fixture";
import {
  KindChip,
  MediaTile,
  SimilarList,
  StateReadout,
  useDeskState,
  type DeskActions,
  type ResearchVerdict,
} from "./shared";

/* ------------------------------------------------------------------ */
/* Variant D — Lens desk                                               */
/* ------------------------------------------------------------------ */

export const LENSES = [
  { key: "days", label: "Days" },
  { key: "topics", label: "Topics" },
  { key: "kind", label: "Kind" },
  { key: "media", label: "Media" },
  { key: "reports", label: "Reports" },
] as const;

export type LensKey = (typeof LENSES)[number]["key"];

export type LensGroup = {
  key: string;
  label: string;
  sub?: string;
  threads: ProtoQueueThread[];
};

export function groupBy(lens: LensKey): LensGroup[] {
  if (lens === "days") {
    return DAYS.map((day) => ({
      key: day.key,
      label: day.label,
      sub: day.region,
      threads: QUEUE.filter((thread) => thread.dayKey === day.key),
    }));
  }
  if (lens === "topics") {
    const topics = new Map<string, ProtoQueueThread[]>();
    for (const thread of QUEUE) {
      const topic = topicOf(thread);
      topics.set(topic, [...(topics.get(topic) ?? []), thread]);
    }
    return [...topics.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([topic, threads]) => ({
        key: topic,
        label: topic,
        sub: `${threads.length} Thread${threads.length === 1 ? "" : "s"}`,
        threads,
      }));
  }
  if (lens === "kind") {
    return KINDS.map((kind) => ({
      key: kind,
      label: kind,
      threads: QUEUE.filter((thread) => thread.kindGuess === kind),
    })).filter((group) => group.threads.length > 0);
  }
  if (lens === "media") {
    const buckets: Array<[string, (t: ProtoQueueThread) => boolean]> = [
      ["photos", (t) => t.media.some((m) => m.type === "photo")],
      ["audio", (t) => t.media.some((m) => m.type === "audio")],
      ["video", (t) => t.media.some((m) => m.type === "video")],
      ["text only", (t) => t.media.length === 0],
    ];
    return buckets
      .map(([label, match]) => ({
        key: label,
        label,
        threads: QUEUE.filter(match),
      }))
      .filter((group) => group.threads.length > 0);
  }
  // reports
  return [
    {
      key: "reports",
      label: "full reports",
      sub: "Artifact candidates",
      threads: QUEUE.filter((thread) => thread.hasReport),
    },
    {
      key: "notes",
      label: "quick notes",
      threads: QUEUE.filter((thread) => !thread.hasReport),
    },
  ];
}

export function DeskD() {
  const desk = useDeskState();
  const [lens, setLens] = useState<LensKey>("topics");
  const [openId, setOpenId] = useState<string | null>(QUEUE[0].id);

  const groups = useMemo(() => groupBy(lens), [lens]);
  const flat = useMemo(
    () => groups.flatMap((group) => group.threads),
    [groups],
  );

  function step(delta: number) {
    if (flat.length === 0) return;
    const index = Math.max(
      0,
      flat.findIndex((thread) => thread.id === openId),
    );
    setOpenId(flat[(index + delta + flat.length) % flat.length].id);
  }

  function fileOpen(verdict: ResearchVerdict) {
    if (!openId) return;
    desk.fileThread(openId, verdict);
    step(1);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "j") step(1);
      else if (event.key === "k") step(-1);
      else if (event.key === "r") fileOpen("kept");
      else if (event.key === "n") fileOpen(null);
      else if (event.key === "x") fileOpen("dismissed");
      else if (event.key === "g") {
        const index = LENSES.findIndex((entry) => entry.key === lens);
        setLens(LENSES[(index + 1) % LENSES.length].key);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prototype: closes over latest state
  }, [openId, lens, flat, desk.state]);

  return (
    <div className="di-shell di-d">
      <header className="di-header">
        <h1>Lens desk</h1>
        <div className="di-d-lenses" role="tablist" aria-label="Group by">
          <span className="di-d-lenses-label">Group by</span>
          {LENSES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={lens === entry.key}
              className={lens === entry.key ? "active" : ""}
              onClick={() => setLens(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="di-keys">
          <kbd>g</kbd> next lens · <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>r</kbd>{" "}
          keep · <kbd>n</kbd> done · <kbd>x</kbd> dismiss
        </p>
        <StateReadout state={desk.state} />
      </header>

      <div className="di-d-groups">
        {groups.map((group) => {
          const open = group.threads.filter(
            (thread) => !desk.state[thread.id].reviewed,
          ).length;
          return (
            <section key={group.key} className="di-d-group">
              <header className="di-d-grouphead">
                <h2>{group.label}</h2>
                {group.sub ? <span>{group.sub}</span> : null}
                <span className="di-d-groupcount">
                  {open === 0 ? "clear" : `${open} open`}
                </span>
              </header>
              <ul>
                {group.threads.map((thread) => {
                  const filing = desk.state[thread.id];
                  const isOpen = openId === thread.id;
                  return (
                    <li
                      key={thread.id}
                      className={`di-d-row${isOpen ? " open" : ""}${filing.reviewed ? " done" : ""}`}
                    >
                      <button
                        type="button"
                        className="di-d-rowhead"
                        aria-expanded={isOpen}
                        onClick={() => setOpenId(isOpen ? null : thread.id)}
                      >
                        <span className="di-d-rowtitle">{thread.title}</span>
                        <span className="di-d-rowmeta">
                          {lens === "days" ? null : (
                            <span>{dayOf(thread).label}</span>
                          )}
                          <KindChip kind={filing.kind} />
                          {thread.media.length > 0 ? (
                            <span className="di-d-rowmedia">
                              {thread.media.length}⧉
                            </span>
                          ) : null}
                          {thread.related.length > 0 ? (
                            <span className="di-d-rowprior">
                              {thread.related.length} prior
                            </span>
                          ) : null}
                          {filing.reviewed ? (
                            <span className="di-reviewed-tag">reviewed</span>
                          ) : null}
                        </span>
                      </button>
                      {isOpen ? (
                        <div className="di-d-detail">
                          <blockquote className="di-words">
                            {thread.excerpt}
                          </blockquote>
                          <div className="di-d-detail-cols">
                            <section className="di-report">
                              <h3>Enrichment</h3>
                              <p>{thread.enrichmentSummary}</p>
                            </section>
                            <div className="di-d-detail-side">
                              {thread.media.length > 0 ? (
                                <div className="di-d-detail-media">
                                  {thread.media.map((media) => (
                                    <MediaTile
                                      key={media.id}
                                      media={media}
                                      size="sm"
                                    />
                                  ))}
                                </div>
                              ) : null}
                              <SimilarList related={thread.related} compact />
                            </div>
                          </div>
                          <div className="di-file-buttons">
                            <button
                              type="button"
                              className="di-file keep"
                              onClick={() => fileOpen("kept")}
                            >
                              Keep research · done
                            </button>
                            <button
                              type="button"
                              className="di-file plain"
                              onClick={() => fileOpen(null)}
                            >
                              Just done
                            </button>
                            <button
                              type="button"
                              className="di-file dismiss"
                              onClick={() => fileOpen("dismissed")}
                            >
                              Dismiss · done
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant E — Dialogue desk                                           */
/* ------------------------------------------------------------------ */

type Turn = {
  role: "walker" | "desk";
  text: string;
  pending?: boolean;
};

function ThreadDialogue({
  thread,
  desk,
}: {
  thread: ProtoQueueThread;
  desk: DeskActions;
}) {
  const filing = desk.state[thread.id];
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const asked = turns.filter((turn) => turn.role === "walker").map((t) => t.text);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns.length]);

  function ask(question: string) {
    const suggestion = thread.askSuggestions.find((s) => s.q === question);
    const answer = suggestion
      ? suggestion.a
      : `(Simulated) The desk would research "${question}" against this Thread, its ${
          thread.related.length
        } prior mention${thread.related.length === 1 ? "" : "s"}, and the walker profile, then append the answer here as a new Enrichment.`;
    setTurns((prev) => [
      ...prev,
      { role: "walker", text: question },
      { role: "desk", text: answer, pending: true },
    ]);
    setDraft("");
    window.setTimeout(() => {
      setTurns((prev) =>
        prev.map((turn) => ({ ...turn, pending: false })),
      );
    }, 550);
  }

  return (
    <article className="di-e-thread" aria-label="Thread dialogue">
      <header className="di-e-filebar">
        <div className="di-e-filebar-title">
          <h2>{thread.title}</h2>
          <span>
            {dayOf(thread).label} · {timeOf(thread.walkedAt)} · {thread.place}
          </span>
        </div>
        <div className="di-e-filebar-actions">
          <button
            type="button"
            className={`di-file keep${filing.research === "kept" ? " on" : ""}`}
            onClick={() => desk.setResearch(thread.id, "kept")}
          >
            Keep research
          </button>
          <button
            type="button"
            className={`di-e-donebtn${filing.reviewed ? " done" : ""}`}
            onClick={() => desk.setReviewed(thread.id, !filing.reviewed)}
          >
            {filing.reviewed ? "Reviewed ✓" : "Mark reviewed"}
          </button>
        </div>
      </header>

      <div className="di-e-transcript">
        <div className="di-e-turn walker">
          <span className="di-e-role">You, on the trail</span>
          <p>{thread.excerpt}</p>
          {thread.media.length > 0 ? (
            <div className="di-e-turn-media">
              {thread.media.map((media) => (
                <MediaTile key={media.id} media={media} size="sm" />
              ))}
            </div>
          ) : null}
        </div>

        <div className="di-e-turn desk">
          <span className="di-e-role">Enrichment</span>
          <p>{thread.enrichmentSummary}</p>
          {thread.related.length > 0 ? (
            <details className="di-e-prior">
              <summary>{thread.related.length} prior mention{thread.related.length === 1 ? "" : "s"}</summary>
              <SimilarList related={thread.related} compact />
            </details>
          ) : null}
        </div>

        {turns.map((turn, index) => (
          <div
            key={index}
            className={`di-e-turn ${turn.role}${turn.pending ? " pending" : ""}`}
          >
            <span className="di-e-role">
              {turn.role === "walker" ? "You, at the desk" : "Desk"}
            </span>
            <p>{turn.pending ? "…" : turn.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <footer className="di-e-ask">
        <div className="di-e-suggestions">
          {thread.askSuggestions
            .filter((suggestion) => !asked.includes(suggestion.q))
            .map((suggestion) => (
              <button
                key={suggestion.q}
                type="button"
                onClick={() => ask(suggestion.q)}
              >
                {suggestion.q}
              </button>
            ))}
        </div>
        <form
          className="di-e-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) ask(draft.trim());
          }}
        >
          <input
            type="text"
            value={draft}
            placeholder="Ask this Thread anything…"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" disabled={!draft.trim()}>
            Ask
          </button>
        </form>
      </footer>
    </article>
  );
}

export function DeskE() {
  const desk = useDeskState();
  const [focusId, setFocusId] = useState(QUEUE[0].id);
  const focus = QUEUE.find((thread) => thread.id === focusId) ?? QUEUE[0];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const index = QUEUE.findIndex((thread) => thread.id === focusId);
      if (event.key === "j")
        setFocusId(QUEUE[(index + 1) % QUEUE.length].id);
      else if (event.key === "k")
        setFocusId(QUEUE[(index - 1 + QUEUE.length) % QUEUE.length].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId]);

  return (
    <div className="di-shell di-e">
      <header className="di-header">
        <h1>Dialogue desk</h1>
        <p className="di-keys">
          The Thread is a conversation — ask into it, keep what comes back.{" "}
          <kbd>j</kbd>/<kbd>k</kbd> switch Threads.
        </p>
        <StateReadout state={desk.state} />
      </header>
      <div className="di-e-panes">
        <nav className="di-e-strip" aria-label="Queue">
          {QUEUE.map((thread) => {
            const filing = desk.state[thread.id];
            return (
              <button
                key={thread.id}
                type="button"
                className={`di-e-strip-item${thread.id === focusId ? " active" : ""}${filing.reviewed ? " done" : ""}`}
                onClick={() => setFocusId(thread.id)}
              >
                <span
                  className={`di-e-dot${filing.reviewed ? " done" : ""}`}
                  aria-hidden="true"
                />
                <span className="di-e-strip-title">{thread.title}</span>
                <span className="di-e-strip-day">{dayOf(thread).label}</span>
              </button>
            );
          })}
        </nav>
        <ThreadDialogue key={focus.id} thread={focus} desk={desk} />
      </div>
    </div>
  );
}
