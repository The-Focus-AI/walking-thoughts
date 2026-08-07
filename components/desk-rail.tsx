"use client";

import Link from "next/link";
import {
  ATTENTION_OPTIONS,
  GROUP_LABELS,
  KIND_OPTIONS,
  LENSES,
  LENS_LABELS,
  MEDIA_OPTIONS,
  REPORT_OPTIONS,
  STATE_OPTIONS,
  UNFILED,
  facetHref,
  toggleFacet,
  type FacetGroup,
  type FacetOption,
  type FacetSelection,
  type Lens,
} from "@/lib/desk/facets";
import type { Project } from "@/lib/sync/types";

/**
 * The desk's facet rail: every way of narrowing the pile, each row with the
 * count it would leave. Desktop only — the phone renders the same model as
 * chips (docs/desk.md).
 *
 * Rows are links so the selection is URL-carried: reload, Back, and a link
 * pasted to the phone all land on the same working set. A row with nothing
 * behind it is a button that says zero and cannot be pressed — the shape of
 * the pile includes what it does not hold.
 *
 * The rail deliberately skips `useLinkFallback`: these navigations only
 * change the query, so the hook's deadline would fire a full page load on
 * every click rather than insure against one.
 */
export function DeskRail({
  base,
  selection,
  lens,
  counts,
  projects,
  mentions,
}: {
  base: string;
  selection: FacetSelection;
  lens: Lens;
  counts: Record<FacetGroup, Record<string, number>>;
  projects: Project[];
  /** Every noun the visible pile mentions, most mentioned first. */
  mentions: FacetOption[];
}) {
  const groups: Array<{ group: FacetGroup; options: FacetOption[] }> = [
    { group: "state", options: STATE_OPTIONS },
    { group: "attention", options: ATTENTION_OPTIONS },
    { group: "kind", options: KIND_OPTIONS },
    {
      group: "project",
      options: [
        ...projects.map((project) => ({
          value: project.id,
          label: project.name,
        })),
        { value: UNFILED, label: "Unfiled" },
      ],
    },
    { group: "mention", options: mentions },
    { group: "media", options: MEDIA_OPTIONS },
    { group: "reports", options: REPORT_OPTIONS },
  ];

  const anyFacet = Object.values(selection).some(Boolean);

  return (
    <aside className="desk-rail" aria-label="Facets" data-testid="desk-rail">
      <div className="desk-rail-head">
        <p className="desk-rail-title">Narrow</p>
        {anyFacet ? (
          <Link
            className="desk-rail-clear"
            href={facetHref(base, {}, lens)}
            data-testid="facet-clear"
          >
            Clear
          </Link>
        ) : null}
      </div>

      {groups.map(({ group, options }) => (
        <section className="desk-rail-group" key={group}>
          <h2 className="desk-rail-group-title">{GROUP_LABELS[group]}</h2>
          <ul className="desk-rail-rows">
            {options.map((option) => {
              const active = selection[group] === option.value;
              const count = counts[group]?.[option.value] ?? 0;
              const testId = `facet-${group}-${option.value}`;
              if (count === 0 && !active) {
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      className="desk-rail-row is-empty"
                      data-testid={testId}
                      disabled
                    >
                      <span className="desk-rail-row-label">
                        {option.label}
                      </span>
                      <span className="desk-rail-row-count">0</span>
                    </button>
                  </li>
                );
              }
              return (
                <li key={option.value}>
                  <Link
                    className={
                      active ? "desk-rail-row is-active" : "desk-rail-row"
                    }
                    href={facetHref(
                      base,
                      toggleFacet(selection, group, option.value),
                      lens,
                    )}
                    aria-current={active ? "true" : undefined}
                    data-testid={testId}
                  >
                    <span className="desk-rail-row-label">{option.label}</span>
                    <span className="desk-rail-row-count">{count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </aside>
  );
}

/**
 * The Lens control. A Lens re-stacks what the facets let through and never
 * changes what is in it, so it sits above the stacks rather than in the rail.
 */
export function LensControl({
  base,
  selection,
  lens,
}: {
  base: string;
  selection: FacetSelection;
  lens: Lens;
}) {
  return (
    <nav className="desk-lens" aria-label="Lens" data-testid="desk-lens">
      <span className="desk-lens-label">Stack by</span>
      {LENSES.map((option) => (
        <Link
          key={option}
          className={
            option === lens ? "desk-lens-option is-active" : "desk-lens-option"
          }
          href={facetHref(base, selection, option)}
          aria-current={option === lens ? "true" : undefined}
          data-testid={`lens-${option}`}
        >
          {LENS_LABELS[option]}
        </Link>
      ))}
    </nav>
  );
}
