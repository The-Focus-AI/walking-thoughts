"use client";

/**
 * PROTOTYPE — three structurally different desktop processing surfaces.
 *
 * A — Triage rail   : mail-client three-pane, one Thread in focus, keyboard-first
 * B — Light table   : media inventory contact sheet; file Threads through their attachments
 * C — Batch ledger  : dense day-batched table with inline cells and multi-select sweep
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  DAYS,
  dayOf,
  formatBytes,
  KINDS,
  PROJECTS,
  projectName,
  QUEUE,
  timeOf,
  type ProtoMedia,
  type ProtoQueueThread,
} from "./fixture";
import {
  KindChip,
  MediaTile,
  mediaTotals,
  SimilarList,
  StateReadout,
  useDeskState,
  type DeskActions,
  type ResearchVerdict,
} from "./shared";

export const DESK_VARIANTS = [
  { key: "A", label: "Triage rail" },
  { key: "B", label: "Light table" },
  { key: "C", label: "Batch ledger" },
] as const;

/* ------------------------------------------------------------------ */
/* Shared filing controls (small enough to share without collapsing    */
/* the variants into one layout)                                       */
/* ------------------------------------------------------------------ */

function FilingControls({
  thread,
  desk,
  layout = "row",
}: {
  thread: ProtoQueueThread;
  desk: DeskActions;
  layout?: "row" | "stack";
}) {
  const filing = desk.state[thread.id];
  return (
    <div className={`di-filing di-filing-${layout}`}>
      <label>
        Kind
        <select
          value={filing.kind}
          onChange={(event) =>
            desk.setKind(thread.id, event.target.value as (typeof KINDS)[number])
          }
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
              {kind === thread.kindGuess ? " (guessed)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Project
        <select
          value={filing.projectId ?? ""}
          onChange={(event) =>
            desk.setProject(thread.id, event.target.value || null)
          }
        >
          <option value="">— none —</option>
          {PROJECTS.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
              {project.proposed ? " (proposed)" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="di-file-buttons">
        <button
          type="button"
          className="di-file keep"
          onClick={() => desk.fileThread(thread.id, "kept")}
        >
          Keep research · done
        </button>
        <button
          type="button"
          className="di-file plain"
          onClick={() => desk.fileThread(thread.id, null)}
        >
          Just done
        </button>
        <button
          type="button"
          className="di-file dismiss"
          onClick={() => desk.fileThread(thread.id, "dismissed")}
        >
          Dismiss · done
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant A — Triage rail                                             */
/* ------------------------------------------------------------------ */

export function DeskA() {
  const desk = useDeskState();
  const [focusId, setFocusId] = useState(QUEUE[0].id);
  const focus = QUEUE.find((thread) => thread.id === focusId) ?? QUEUE[0];
  const filing = desk.state[focus.id];

  function step(delta: number) {
    const index = QUEUE.findIndex((thread) => thread.id === focusId);
    const next = QUEUE[(index + delta + QUEUE.length) % QUEUE.length];
    setFocusId(next.id);
  }

  function fileAndAdvance(verdict: ResearchVerdict) {
    desk.fileThread(focus.id, verdict);
    const after = QUEUE.filter(
      (thread) => !desk.state[thread.id].reviewed && thread.id !== focus.id,
    );
    if (after.length > 0) setFocusId(after[0].id);
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
      else if (event.key === "r") fileAndAdvance("kept");
      else if (event.key === "n") fileAndAdvance(null);
      else if (event.key === "x") fileAndAdvance("dismissed");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prototype: closes over latest focus
  }, [focusId, desk.state]);

  return (
    <div className="di-shell di-a">
      <header className="di-header">
        <h1>Queue</h1>
        <p className="di-keys">
          <kbd>j</kbd>/<kbd>k</kbd> next / prev · <kbd>r</kbd> keep research ·{" "}
          <kbd>n</kbd> just done · <kbd>x</kbd> dismiss
        </p>
        <StateReadout state={desk.state} />
      </header>
      <div className="di-a-panes">
        <nav className="di-a-list" aria-label="Review queue">
          {DAYS.map((day) => {
            const threads = QUEUE.filter((thread) => thread.dayKey === day.key);
            const open = threads.filter(
              (thread) => !desk.state[thread.id].reviewed,
            ).length;
            return (
              <section key={day.key}>
                <h2>
                  {day.label}
                  <span className="di-a-daycount">
                    {open === 0 ? "clear" : `${open} open`}
                  </span>
                </h2>
                <ul>
                  {threads.map((thread) => {
                    const done = desk.state[thread.id].reviewed;
                    return (
                      <li key={thread.id}>
                        <button
                          type="button"
                          className={`di-a-item${thread.id === focusId ? " active" : ""}${done ? " done" : ""}`}
                          onClick={() => setFocusId(thread.id)}
                        >
                          <span className="di-a-item-title">{thread.title}</span>
                          <span className="di-a-item-meta">
                            {timeOf(thread.walkedAt)} ·{" "}
                            <KindChip kind={desk.state[thread.id].kind} />
                            {thread.media.length > 0 ? (
                              <span className="di-a-item-media">
                                {thread.media.length}⧉
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </nav>

        <article className="di-a-focus" aria-label="Thread in focus">
          <header>
            <div className="di-a-focus-head">
              <h2>{focus.title}</h2>
              {filing.reviewed ? (
                <span className="di-reviewed-tag">reviewed</span>
              ) : null}
            </div>
            <p className="di-a-focus-meta">
              {dayOf(focus).label} · {timeOf(focus.walkedAt)} · {focus.place}
              {projectName(filing.projectId) ? (
                <> · filed to {projectName(filing.projectId)}</>
              ) : null}
            </p>
          </header>
          <blockquote className="di-words">{focus.excerpt}</blockquote>
          {focus.media.length > 0 ? (
            <div className="di-a-media">
              {focus.media.map((media) => (
                <MediaTile key={media.id} media={media} size="md" />
              ))}
            </div>
          ) : null}
          <section className="di-report">
            <h3>Enrichment</h3>
            <p>{focus.enrichmentSummary}</p>
            {filing.research ? (
              <p className={`di-verdict ${filing.research}`}>
                research {filing.research}
              </p>
            ) : null}
          </section>
          <FilingControls thread={focus} desk={desk} layout="row" />
        </article>

        <aside className="di-a-similar" aria-label="Previously">
          <h3>Previously</h3>
          <p className="di-a-similar-sub">
            Similar past Threads (embedding stand-in) and the mention they share.
          </p>
          <SimilarList related={focus.related} />
          <h3>Mentions</h3>
          <ul className="di-mentions">
            {focus.mentions.map((mention) => (
              <li key={mention}>{mention}</li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant B — Light table                                             */
/* ------------------------------------------------------------------ */

type MediaFilter = "all" | ProtoMedia["type"] | "open";

export function DeskB() {
  const desk = useDeskState();
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const totals = useMemo(() => mediaTotals(QUEUE), []);
  const selected = QUEUE.find((thread) => thread.id === selectedId) ?? null;

  function tileVisible(thread: ProtoQueueThread, media: ProtoMedia | null) {
    if (filter === "open") return !desk.state[thread.id].reviewed;
    if (filter === "all") return true;
    return media?.type === filter;
  }

  return (
    <div className="di-shell di-b">
      <header className="di-header">
        <h1>Light table</h1>
        <div className="di-b-inventory" aria-label="Stored media">
          <span>
            <strong>{totals.total}</strong> attachments
          </span>
          <span>{totals.photos} photos</span>
          <span>{totals.audio} audio</span>
          <span>{totals.video} video</span>
          <span>
            <strong>{totals.size}</strong> stored
          </span>
        </div>
        <div className="di-b-filters" role="tablist" aria-label="Filter">
          {(
            [
              ["all", "Everything"],
              ["photo", "Photos"],
              ["audio", "Audio"],
              ["video", "Video"],
              ["open", "Unreviewed"],
            ] as Array<[MediaFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <StateReadout state={desk.state} />
      </header>

      <div className="di-b-body">
        <div className="di-b-sheet">
          {DAYS.map((day) => {
            const threads = QUEUE.filter((thread) => thread.dayKey === day.key);
            const tiles = threads.flatMap((thread) => {
              const entries: Array<{
                thread: ProtoQueueThread;
                media: ProtoMedia | null;
              }> = thread.media.map((media) => ({ thread, media }));
              if (entries.length === 0) entries.push({ thread, media: null });
              return entries.filter((entry) =>
                tileVisible(entry.thread, entry.media),
              );
            });
            if (tiles.length === 0) return null;
            return (
              <section key={day.key}>
                <h2>
                  {day.label} <span>{day.region}</span>
                </h2>
                <div className="di-b-grid">
                  {tiles.map(({ thread, media }) => {
                    const open = !desk.state[thread.id].reviewed;
                    return (
                      <button
                        key={media ? media.id : thread.id}
                        type="button"
                        className={`di-b-tile${thread.id === selectedId ? " active" : ""}`}
                        onClick={() => setSelectedId(thread.id)}
                        aria-label={`${thread.title}${open ? " (unreviewed)" : ""}`}
                      >
                        {media ? (
                          <MediaTile media={media} size="lg" ringed={open} />
                        ) : (
                          <span
                            className={`di-b-text-tile${open ? " ringed" : ""}`}
                          >
                            <em>text only</em>
                            {thread.excerpt.slice(0, 72)}…
                          </span>
                        )}
                        <span className="di-b-tile-caption">
                          {thread.title}
                          {media ? (
                            <small>{formatBytes(media.bytes)}</small>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <aside
          className={`di-b-drawer${selected ? " open" : ""}`}
          aria-label="Thread drawer"
        >
          {selected ? (
            <>
              <header>
                <h3>{selected.title}</h3>
                {desk.state[selected.id].reviewed ? (
                  <span className="di-reviewed-tag">reviewed</span>
                ) : null}
              </header>
              <p className="di-a-focus-meta">
                {dayOf(selected).label} · {selected.place} ·{" "}
                {selected.media.length} attachment
                {selected.media.length === 1 ? "" : "s"}
              </p>
              <blockquote className="di-words">{selected.excerpt}</blockquote>
              <section className="di-report">
                <h3>Enrichment</h3>
                <p>{selected.enrichmentSummary}</p>
              </section>
              <SimilarList related={selected.related} compact />
              <FilingControls thread={selected} desk={desk} layout="stack" />
            </>
          ) : (
            <p className="di-b-drawer-empty">
              Pick a tile to file its Thread. Ringed tiles are unreviewed.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant C — Batch ledger                                            */
/* ------------------------------------------------------------------ */

export function DeskC() {
  const desk = useDeskState();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const checkedIds = QUEUE.filter((thread) => checked[thread.id]).map(
    (thread) => thread.id,
  );

  function sweep(ids: string[], verdict: ResearchVerdict) {
    for (const id of ids) desk.fileThread(id, verdict);
    setChecked({});
  }

  return (
    <div className="di-shell di-c">
      <header className="di-header">
        <h1>Ledger</h1>
        <p className="di-keys">
          Inline cells settle Kind, Project, and the research verdict; the sweep
          bar clears a selection or a whole day at once.
        </p>
        <StateReadout state={desk.state} />
      </header>

      <div
        className={`di-c-sweepbar${checkedIds.length > 0 ? " armed" : ""}`}
        aria-label="Sweep selection"
      >
        <span>
          {checkedIds.length} selected
        </span>
        <button
          type="button"
          disabled={checkedIds.length === 0}
          onClick={() => sweep(checkedIds, "kept")}
        >
          Keep research · reviewed
        </button>
        <button
          type="button"
          disabled={checkedIds.length === 0}
          onClick={() => sweep(checkedIds, null)}
        >
          Mark reviewed
        </button>
        <button
          type="button"
          disabled={checkedIds.length === 0}
          onClick={() => sweep(checkedIds, "dismissed")}
        >
          Dismiss · reviewed
        </button>
      </div>

      {DAYS.map((day) => {
        const threads = QUEUE.filter((thread) => thread.dayKey === day.key);
        const open = threads.filter(
          (thread) => !desk.state[thread.id].reviewed,
        );
        return (
          <section key={day.key} className="di-c-day">
            <header className="di-c-dayhead">
              <h2>
                {day.label} <span>{day.region} · {day.distanceKm} km</span>
              </h2>
              <button
                type="button"
                disabled={open.length === 0}
                onClick={() =>
                  sweep(
                    open.map((thread) => thread.id),
                    null,
                  )
                }
              >
                {open.length === 0
                  ? "Day clear"
                  : `Sweep day (${open.length})`}
              </button>
            </header>
            <table className="di-c-table">
              <thead>
                <tr>
                  <th aria-label="Select" />
                  <th>Time</th>
                  <th>Thread</th>
                  <th>Kind</th>
                  <th>Project</th>
                  <th>Research</th>
                  <th>Prior</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {threads.map((thread) => {
                  const filing = desk.state[thread.id];
                  const isExpanded = expanded === thread.id;
                  return (
                    <Fragment key={thread.id}>
                      <tr className={filing.reviewed ? "done" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${thread.title}`}
                            checked={!!checked[thread.id]}
                            onChange={(event) =>
                              setChecked((prev) => ({
                                ...prev,
                                [thread.id]: event.target.checked,
                              }))
                            }
                          />
                        </td>
                        <td className="di-c-time">{timeOf(thread.walkedAt)}</td>
                        <td className="di-c-title">
                          <strong>{thread.title}</strong>
                          <small>{thread.excerpt}</small>
                          {thread.media.length > 0 ? (
                            <span className="di-c-mediacount">
                              {thread.media.length}⧉
                            </span>
                          ) : null}
                        </td>
                        <td>
                          <select
                            aria-label="Kind"
                            value={filing.kind}
                            onChange={(event) =>
                              desk.setKind(
                                thread.id,
                                event.target.value as (typeof KINDS)[number],
                              )
                            }
                          >
                            {KINDS.map((kind) => (
                              <option key={kind} value={kind}>
                                {kind}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            aria-label="Project"
                            value={filing.projectId ?? ""}
                            onChange={(event) =>
                              desk.setProject(
                                thread.id,
                                event.target.value || null,
                              )
                            }
                          >
                            <option value="">—</option>
                            {PROJECTS.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="di-c-verdict" role="group">
                            <button
                              type="button"
                              className={filing.research === "kept" ? "on keep" : ""}
                              onClick={() =>
                                desk.setResearch(
                                  thread.id,
                                  filing.research === "kept" ? null : "kept",
                                )
                              }
                            >
                              keep
                            </button>
                            <button
                              type="button"
                              className={
                                filing.research === "dismissed" ? "on dismiss" : ""
                              }
                              onClick={() =>
                                desk.setResearch(
                                  thread.id,
                                  filing.research === "dismissed"
                                    ? null
                                    : "dismissed",
                                )
                              }
                            >
                              drop
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="di-c-prior"
                            disabled={thread.related.length === 0}
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpanded(isExpanded ? null : thread.id)
                            }
                          >
                            {thread.related.length === 0
                              ? "new"
                              : `${thread.related.length} prior`}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`di-c-state${filing.reviewed ? " done" : ""}`}
                            onClick={() =>
                              desk.setReviewed(thread.id, !filing.reviewed)
                            }
                          >
                            {filing.reviewed ? "reviewed" : "open"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="di-c-expand">
                          <td colSpan={8}>
                            <SimilarList related={thread.related} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
