"use client";

/**
 * PROTOTYPE — round-3 desk-inbox variants: three takes on filtering D.
 * D's grouped, expandable, keyboard-driven list stays; what differs is how
 * you zoom in — which ones are questions, which are tasks, which are open.
 *
 * F — Filter bar desk : explicit controls — search box, kind chips, state
 *                       segmented control, media select, over the lens groups
 * G — Command desk    : one omnibox speaking tokens (kind:question is:open
 *                       has:photo by:topics wall) plus free text
 * H — Facet rail desk : sidebar facets with live counts; click to combine
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  dayOf,
  KINDS,
  QUEUE,
  topicOf,
  type ProtoKind,
  type ProtoQueueThread,
} from "./fixture";
import { groupBy, LENSES, type LensGroup, type LensKey } from "./iterate-variants";
import {
  KindChip,
  MediaTile,
  SimilarList,
  StateReadout,
  useDeskState,
  type DeskActions,
  type Filing,
  type ResearchVerdict,
} from "./shared";

/* ------------------------------------------------------------------ */
/* Shared filter model                                                 */
/* ------------------------------------------------------------------ */

type StateFilter = "all" | "open" | "reviewed" | "kept";
type MediaFilter = "any" | "photo" | "audio" | "video" | "none";

type Filters = {
  text: string;
  kinds: ProtoKind[];
  state: StateFilter;
  media: MediaFilter;
  /** null = don't care, true = has prior mentions, false = first sighting */
  prior: boolean | null;
  report: boolean | null;
};

const EMPTY_FILTERS: Filters = {
  text: "",
  kinds: [],
  state: "all",
  media: "any",
  prior: null,
  report: null,
};

function matches(
  thread: ProtoQueueThread,
  filing: Filing,
  filters: Filters,
): boolean {
  if (filters.kinds.length > 0 && !filters.kinds.includes(filing.kind))
    return false;
  if (filters.state === "open" && filing.reviewed) return false;
  if (filters.state === "reviewed" && !filing.reviewed) return false;
  if (filters.state === "kept" && filing.research !== "kept") return false;
  if (filters.media === "none" && thread.media.length > 0) return false;
  if (
    filters.media !== "any" &&
    filters.media !== "none" &&
    !thread.media.some((media) => media.type === filters.media)
  )
    return false;
  if (filters.prior === true && thread.related.length === 0) return false;
  if (filters.prior === false && thread.related.length > 0) return false;
  if (filters.report !== null && thread.hasReport !== filters.report)
    return false;
  if (filters.text) {
    const haystack = [
      thread.title,
      thread.excerpt,
      thread.enrichmentSummary,
      thread.place,
      ...thread.mentions,
      topicOf(thread),
    ]
      .join(" ")
      .toLowerCase();
    for (const term of filters.text.toLowerCase().split(/\s+/)) {
      if (term && !haystack.includes(term)) return false;
    }
  }
  return true;
}

function filterGroups(
  lens: LensKey,
  filters: Filters,
  desk: DeskActions,
): LensGroup[] {
  return groupBy(lens)
    .map((group) => ({
      ...group,
      threads: group.threads.filter((thread) =>
        matches(thread, desk.state[thread.id], filters),
      ),
    }))
    .filter((group) => group.threads.length > 0);
}

/* ------------------------------------------------------------------ */
/* Shared grouped row list (D's rows; the variants differ above it)    */
/* ------------------------------------------------------------------ */

function useRowKeys(
  flat: ProtoQueueThread[],
  openId: string | null,
  setOpenId: (id: string | null) => void,
  desk: DeskActions,
  extra?: (event: KeyboardEvent) => boolean,
) {
  useEffect(() => {
    function step(delta: number) {
      if (flat.length === 0) return;
      const index = Math.max(
        0,
        flat.findIndex((thread) => thread.id === openId),
      );
      setOpenId(flat[(index + delta + flat.length) % flat.length].id);
    }
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
      if (extra?.(event)) return;
      if (event.key === "j") step(1);
      else if (event.key === "k") step(-1);
      else if (event.key === "r" || event.key === "n" || event.key === "x") {
        if (!openId) return;
        const verdict: ResearchVerdict =
          event.key === "r" ? "kept" : event.key === "x" ? "dismissed" : null;
        desk.fileThread(openId, verdict);
        step(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prototype: closes over latest state
  }, [flat, openId, desk.state]);
}

function GroupedRows({
  groups,
  hideDay,
  openId,
  setOpenId,
  desk,
}: {
  groups: LensGroup[];
  hideDay?: boolean;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  desk: DeskActions;
}) {
  if (groups.length === 0) {
    return (
      <p className="di-f-nomatch">
        Nothing matches — loosen a filter to widen the net.
      </p>
    );
  }
  return (
    <>
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
                        {hideDay ? null : <span>{dayOf(thread).label}</span>}
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
                            onClick={() =>
                              desk.fileThread(thread.id, "dismissed")
                            }
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
    </>
  );
}

function countLine(shown: number) {
  return `${shown} of ${QUEUE.length}`;
}

/* ------------------------------------------------------------------ */
/* Variant F — Filter bar desk                                         */
/* ------------------------------------------------------------------ */

export function DeskF() {
  const desk = useDeskState();
  const [lens, setLens] = useState<LensKey>("days");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(
    () => filterGroups(lens, filters, desk),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prototype: desk.state drives it
    [lens, filters, desk.state],
  );
  const flat = useMemo(() => groups.flatMap((group) => group.threads), [groups]);
  const active =
    filters.text !== "" ||
    filters.kinds.length > 0 ||
    filters.state !== "all" ||
    filters.media !== "any";

  useRowKeys(flat, openId, setOpenId, desk, (event) => {
    if (event.key === "/") {
      event.preventDefault();
      searchRef.current?.focus();
      return true;
    }
    if (event.key === "g") {
      const index = LENSES.findIndex((entry) => entry.key === lens);
      setLens(LENSES[(index + 1) % LENSES.length].key);
      return true;
    }
    return false;
  });

  function toggleKind(kind: ProtoKind) {
    setFilters((prev) => ({
      ...prev,
      kinds: prev.kinds.includes(kind)
        ? prev.kinds.filter((entry) => entry !== kind)
        : [...prev.kinds, kind],
    }));
  }

  return (
    <div className="di-shell di-f">
      <header className="di-header">
        <h1>Filter bar</h1>
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
        <StateReadout state={desk.state} />
      </header>

      <div className="di-f-bar" aria-label="Filters">
        <input
          ref={searchRef}
          type="search"
          placeholder="Search words, mentions, places…  ( / )"
          value={filters.text}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, text: event.target.value }))
          }
        />
        <div className="di-f-kinds" role="group" aria-label="Kind">
          {KINDS.filter((kind) =>
            QUEUE.some((thread) => thread.kindGuess === kind),
          ).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={filters.kinds.includes(kind)}
              className={`di-f-kindchip di-kind-${kind}${filters.kinds.includes(kind) ? " on" : ""}`}
              onClick={() => toggleKind(kind)}
            >
              {kind}
            </button>
          ))}
        </div>
        <div className="di-f-state" role="group" aria-label="State">
          {(
            [
              ["all", "All"],
              ["open", "Open"],
              ["reviewed", "Reviewed"],
              ["kept", "Research kept"],
            ] as Array<[StateFilter, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filters.state === key}
              className={filters.state === key ? "on" : ""}
              onClick={() => setFilters((prev) => ({ ...prev, state: key }))}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Media"
          value={filters.media}
          onChange={(event) =>
            setFilters((prev) => ({
              ...prev,
              media: event.target.value as MediaFilter,
            }))
          }
        >
          <option value="any">Any media</option>
          <option value="photo">Has photo</option>
          <option value="audio">Has audio</option>
          <option value="video">Has video</option>
          <option value="none">Text only</option>
        </select>
        <span className="di-f-count">
          {countLine(flat.length)}
          {active ? (
            <button
              type="button"
              className="di-f-clear"
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              clear
            </button>
          ) : null}
        </span>
      </div>

      <div className="di-d-groups">
        <GroupedRows
          groups={groups}
          hideDay={lens === "days"}
          openId={openId}
          setOpenId={setOpenId}
          desk={desk}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant G — Command desk                                            */
/* ------------------------------------------------------------------ */

const TOKEN_SUGGESTIONS = [
  "is:open",
  "kind:question",
  "kind:task",
  "kind:idea",
  "has:photo",
  "has:audio",
  "has:prior",
  "is:report",
  "by:topics",
  "by:kind",
];

function parseCommand(input: string): { filters: Filters; lens: LensKey } {
  const filters: Filters = { ...EMPTY_FILTERS, kinds: [] };
  let lens: LensKey = "days";
  const free: string[] = [];
  for (const raw of input.trim().split(/\s+/)) {
    if (!raw) continue;
    const [head, tail] = raw.includes(":")
      ? [raw.slice(0, raw.indexOf(":")), raw.slice(raw.indexOf(":") + 1)]
      : ["", raw];
    if (head === "kind" && (KINDS as string[]).includes(tail)) {
      filters.kinds = [...filters.kinds, tail as ProtoKind];
    } else if (head === "is" && tail === "open") filters.state = "open";
    else if (head === "is" && tail === "reviewed") filters.state = "reviewed";
    else if (head === "is" && tail === "kept") filters.state = "kept";
    else if (head === "is" && tail === "report") filters.report = true;
    else if (head === "is" && tail === "note") filters.report = false;
    else if (head === "has" && (tail === "photo" || tail === "audio" || tail === "video"))
      filters.media = tail;
    else if (head === "has" && tail === "prior") filters.prior = true;
    else if (head === "has" && tail === "none") filters.media = "none";
    else if (head === "by" && LENSES.some((entry) => entry.key === tail))
      lens = tail as LensKey;
    else free.push(raw);
  }
  filters.text = free.join(" ");
  return { filters, lens };
}

export function DeskG() {
  const desk = useDeskState();
  const [command, setCommand] = useState("is:open");
  const [openId, setOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { filters, lens } = useMemo(() => parseCommand(command), [command]);
  const groups = useMemo(
    () => filterGroups(lens, filters, desk),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prototype: desk.state drives it
    [lens, filters, desk.state],
  );
  const flat = useMemo(() => groups.flatMap((group) => group.threads), [groups]);

  useRowKeys(flat, openId, setOpenId, desk, (event) => {
    if (event.key === "/") {
      event.preventDefault();
      inputRef.current?.focus();
      return true;
    }
    return false;
  });

  function addToken(token: string) {
    setCommand((prev) =>
      prev.split(/\s+/).includes(token) ? prev : `${prev} ${token}`.trim(),
    );
  }

  return (
    <div className="di-shell di-g">
      <header className="di-header">
        <h1>Command desk</h1>
        <p className="di-keys">
          One box does everything — tokens narrow, words search, <kbd>/</kbd>{" "}
          focuses.
        </p>
        <StateReadout state={desk.state} />
      </header>

      <div className="di-g-command">
        <div className="di-g-boxrow">
          <span className="di-g-prompt" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            spellCheck={false}
            placeholder="kind:question is:open has:photo by:topics wall…"
            onChange={(event) => setCommand(event.target.value)}
          />
          <span className="di-f-count">{countLine(flat.length)}</span>
          {command ? (
            <button
              type="button"
              className="di-f-clear"
              onClick={() => setCommand("")}
            >
              clear
            </button>
          ) : null}
        </div>
        <div className="di-g-tokens">
          {TOKEN_SUGGESTIONS.filter(
            (token) => !command.split(/\s+/).includes(token),
          ).map((token) => (
            <button key={token} type="button" onClick={() => addToken(token)}>
              {token}
            </button>
          ))}
        </div>
      </div>

      <div className="di-d-groups">
        <GroupedRows
          groups={groups}
          hideDay={lens === "days"}
          openId={openId}
          setOpenId={setOpenId}
          desk={desk}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant H — Facet rail desk                                         */
/* ------------------------------------------------------------------ */

type FacetSelection = {
  kind: ProtoKind | null;
  state: StateFilter;
  topic: string | null;
  media: MediaFilter;
  prior: boolean | null;
};

const EMPTY_FACETS: FacetSelection = {
  kind: null,
  state: "all",
  topic: null,
  media: "any",
  prior: null,
};

function facetsToFilters(facets: FacetSelection): Filters {
  return {
    ...EMPTY_FILTERS,
    kinds: facets.kind ? [facets.kind] : [],
    state: facets.state,
    media: facets.media,
    prior: facets.prior,
    // topic is applied separately (not a text search)
  };
}

function FacetButton({
  label,
  selected,
  count,
  onClick,
}: {
  label: string;
  selected: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`di-h-facet${selected ? " on" : ""}`}
      disabled={!selected && count === 0}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="di-h-count">{count}</span>
    </button>
  );
}

export function DeskH() {
  const desk = useDeskState();
  const [facets, setFacets] = useState<FacetSelection>(EMPTY_FACETS);
  const [openId, setOpenId] = useState<string | null>(null);

  const matching = useMemo(() => {
    const filters = facetsToFilters(facets);
    return QUEUE.filter(
      (thread) =>
        matches(thread, desk.state[thread.id], filters) &&
        (facets.topic === null || topicOf(thread) === facets.topic),
    );
     
  }, [facets, desk.state]);

  const groups = useMemo(() => {
    const ids = new Set(matching.map((thread) => thread.id));
    return groupBy("days")
      .map((group) => ({
        ...group,
        threads: group.threads.filter((thread) => ids.has(thread.id)),
      }))
      .filter((group) => group.threads.length > 0);
  }, [matching]);
  const flat = useMemo(() => groups.flatMap((group) => group.threads), [groups]);

  useRowKeys(flat, openId, setOpenId, desk);

  /** Count for a candidate facet value with all other facet groups applied. */
  function countWith(part: Partial<FacetSelection>): number {
    const candidate = { ...facets, ...part };
    const filters = facetsToFilters(candidate);
    return QUEUE.filter(
      (thread) =>
        matches(thread, desk.state[thread.id], filters) &&
        (candidate.topic === null || topicOf(thread) === candidate.topic),
    ).length;
  }

  const topics = [...new Set(QUEUE.map((thread) => topicOf(thread)))];
  const active = JSON.stringify(facets) !== JSON.stringify(EMPTY_FACETS);

  return (
    <div className="di-shell di-h">
      <header className="di-header">
        <h1>Facet rail</h1>
        <p className="di-keys">
          The counts answer before you click — <kbd>j</kbd>/<kbd>k</kbd>{" "}
          <kbd>r</kbd>/<kbd>n</kbd>/<kbd>x</kbd> as ever.
        </p>
        <span className="di-f-count">
          {countLine(flat.length)}
          {active ? (
            <button
              type="button"
              className="di-f-clear"
              onClick={() => setFacets(EMPTY_FACETS)}
            >
              clear
            </button>
          ) : null}
        </span>
        <StateReadout state={desk.state} />
      </header>

      <div className="di-h-panes">
        <aside className="di-h-rail" aria-label="Facets">
          <section>
            <h3>State</h3>
            {(
              [
                ["open", "Open"],
                ["reviewed", "Reviewed"],
                ["kept", "Research kept"],
              ] as Array<[StateFilter, string]>
            ).map(([key, label]) => (
              <FacetButton
                key={key}
                label={label}
                selected={facets.state === key}
                count={countWith({ state: key })}
                onClick={() =>
                  setFacets((prev) => ({
                    ...prev,
                    state: prev.state === key ? "all" : key,
                  }))
                }
              />
            ))}
          </section>
          <section>
            <h3>Kind</h3>
            {KINDS.filter((kind) =>
              QUEUE.some((thread) => thread.kindGuess === kind),
            ).map((kind) => (
              <FacetButton
                key={kind}
                label={kind}
                selected={facets.kind === kind}
                count={countWith({ kind })}
                onClick={() =>
                  setFacets((prev) => ({
                    ...prev,
                    kind: prev.kind === kind ? null : kind,
                  }))
                }
              />
            ))}
          </section>
          <section>
            <h3>Topic</h3>
            {topics.map((topic) => (
              <FacetButton
                key={topic}
                label={topic}
                selected={facets.topic === topic}
                count={countWith({ topic })}
                onClick={() =>
                  setFacets((prev) => ({
                    ...prev,
                    topic: prev.topic === topic ? null : topic,
                  }))
                }
              />
            ))}
          </section>
          <section>
            <h3>Media</h3>
            {(
              [
                ["photo", "Photos"],
                ["audio", "Audio"],
                ["video", "Video"],
                ["none", "Text only"],
              ] as Array<[MediaFilter, string]>
            ).map(([key, label]) => (
              <FacetButton
                key={key}
                label={label}
                selected={facets.media === key}
                count={countWith({ media: key })}
                onClick={() =>
                  setFacets((prev) => ({
                    ...prev,
                    media: prev.media === key ? "any" : key,
                  }))
                }
              />
            ))}
          </section>
          <section>
            <h3>History</h3>
            <FacetButton
              label="Has prior mentions"
              selected={facets.prior === true}
              count={countWith({ prior: true })}
              onClick={() =>
                setFacets((prev) => ({
                  ...prev,
                  prior: prev.prior === true ? null : true,
                }))
              }
            />
            <FacetButton
              label="First sighting"
              selected={facets.prior === false}
              count={countWith({ prior: false })}
              onClick={() =>
                setFacets((prev) => ({
                  ...prev,
                  prior: prev.prior === false ? null : false,
                }))
              }
            />
          </section>
        </aside>
        <div className="di-d-groups di-h-list">
          <GroupedRows
            groups={groups}
            hideDay
            openId={openId}
            setOpenId={setOpenId}
            desk={desk}
          />
        </div>
      </div>
    </div>
  );
}
