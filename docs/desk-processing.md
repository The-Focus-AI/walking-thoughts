# Desk processing: the queue, the Research Verdict, and the rail

> **Status (2026-08-07): partially superseded by `day-routing.md` /
> ADR 0017.** There is one system, with one exit gesture. What stands
> from this spec: the facet rail, the Lenses, the similarity work (S2–S3),
> and the Dialogue view (S4) — the ways to *find and read* Threads. What
> is superseded: `r`/`n`/`x` as the filing gestures and Reviewed as the
> terminal state. A Thread's one exit is its **Route** (day-routing.md):
> the rail finds Threads, routing settles them — today's walk through the
> Day flow, the backlog through the same routing gesture on any row here.
> The old verbs map: `x` dismiss → Drop (Artifact retraction per ADR 0016
> unchanged) · `r` keep research → route to Journal · `n` just reviewed →
> no longer exists, because "read it and nothing happens" was the dead
> end being removed.

The sitting-down-afterwards was cumbersome: unreviewed Threads were reached
only through their Days, filing was a per-Thread detour, there was no way to
say "the research was worth keeping but the note is processed," no way to see
the queue's shape (which are questions, which are tasks, which are still
open), and no memory of what similar things were captured before.

This spec is the settled answer, arrived at by prototype (all eight throwaway
variants live under `/prototype/desk-inbox` on branch
`claude/prototype-skill-review-5vdcsc`; verdict D + H in that folder's
VERDICT.md) and by a grilling session whose decisions are recorded here, in
`CONTEXT.md`, and in ADR 0016.

## The shape (decisions 1–3)

**One desk surface.** The Days workspace evolves — no separate queue page.
Day remains the *default* Lens; the facet rail generalizes the shipped `?f=`
filter chips. Glossary: **Day** (softened), **Lens** (new).

**The Research Verdict lives on the Thread.** `kept` / `dismissed` / unset is
one field of Filing, beside Reviewed, Kind, and Project. It is not
per-Enrichment; if per-answer keeps are ever needed, that is an accepted
future migration. See ADR 0016.

**Dismissed retracts the Artifact.** The published page unpublishes; keeping
the research again restores it at the same address. Publish-early (ADR 0014)
is unchanged. Nothing is ever deleted from the Thread — a dismissed report
renders collapsed, and the Thread's history stays whole.

## The surface

The desk workspace (`components/desk-workspace.tsx`) gains:

- **A facet rail** (desktop only), each row a label with a live count:
  - **State**: Open · Reviewed · Research kept
  - **Attention**: Needs a word · Needs attention
  - **Kind**: the seven Kinds, zero-count rows disabled
  - **Project**: the walker's Projects + "unfiled"
  - **Media**: photos · audio · video · text only
  - **Reports**: full report · quick note
  Single-select within a group; groups combine; counts recompute against the
  other groups' active selections; zero-count facets disable rather than
  disappear. Selections are URL-carried (generalizing `?f=`), so links,
  reload, and the sync pill's "N need attention" all keep working.
- **A Lens control**: Days (default) · Topics · Kind · Media · Reports. A
  Lens re-stacks whatever the facets let through; it never filters.
- **Expandable rows**: title, day, Kind chip, media count, prior-mentions
  count (slice 3), Reviewed tag. Expanding shows the walker's words, the
  Enrichment summary, media thumbnails, similar Threads (slice 3), and the
  filing actions.
- **Keyboard**: `j`/`k` move through the visible rows, `r` keep research &
  reviewed, `n` just reviewed, `x` dismiss & reviewed — filing auto-advances
  to the next open row. `g` cycles the Lens. Keys are inert while an input
  is focused.

**The phone keeps chips.** Same filter model, same URL params; the chip row
is the phone's rendering of it, gaining Open and Research kept. No rail on
mobile — the phone stays capture-first.

## Slices (decision 4 — strictly ordered, each ships alone)

### S1 — The queue

Everything above, built only on data the app already holds locally
(kind, reviewedAt, day, attachments, Projects, Artifacts). The Topics Lens
groups by Project with an "unfiled" bucket until mentions exist.

Server seams:

- `ThreadFiling` (`lib/sync/review-client.ts`) and `/api/sync/review` grow
  `researchVerdict: "kept" | "dismissed" | null`; the Neon repository and
  local store (`applyThreadFiling`) carry it; hydration returns it.
- Dismissal calls the Artifact retraction; re-keeping republishes at the
  same address (`lib/artifacts`).

Acceptance (public browser seam, per repo verification style):

- Filtering to Kind = question shows only question Threads with the count
  in the rail; the URL round-trips the selection.
- `r` on an open row records kept + reviewed, the row leaves the Open
  facet, and the next open row gains focus.
- `x` on a Thread with a published Artifact makes its page stop resolving;
  keeping it again restores the same URL.
- A `?facet` link opened on the phone shows the same Threads via chips.

### S2 — Structured gateway output

The Enrichment returns, beside `title`, structured `mentions[]` (places,
species, people, ideas — the recurring nouns of the walk) and
`suggestedQuestions[]` (follow-ups the walker might ask). Stored on the
Enrichment like sources are today.

- Topics Lens becomes Project ?? leading mention; a Mentions facet appears.
- Mentions feed the Proposed Project machinery the same way recurring
  Enrichment guesses already do.

### S3 — Similarity

pgvector on Neon. Capture text + Enrichment text embed during the
enrichment lifecycle (a step after the report lands, same job); backfill is
a one-shot script over existing Threads. Retrieval powers:

- the "N prior" chip on queue rows and the similar-Threads list in the
  expanded row — exact shared-mention links ranked first, embedding
  similarity as fallback;
- retrieval into the Enrichment prompt, so research builds on prior
  mentions instead of starting cold.

Embedding model comes from the gateway like every other model choice
(ADR 0004); the specific model is the S3 ticket's first decision, checked
against `/v1/models` at implementation time, not guessed now.

### S4 — The Dialogue view

The Thread page restyles per prototype variant E, on top of the existing
`ThreadChat` (the capability already exists; this is presentation):

- transcript roles — "You, on the trail" / Enrichment / "You, at the desk"
  / Desk — replacing chat bubbles;
- a filing header bar (Keep research · Mark reviewed) so filing never
  requires leaving the conversation;
- prior mentions folded inside the Enrichment turn (from S3);
- `suggestedQuestions[]` (from S2) as one-tap chips above the composer;
  asked questions commit as ordinary Captures into the Thread, exactly as
  ThreadChat does today.

## Out of scope

- Multi-select facets, saved filters, and a token/command box (prototype
  variant G) — a future keyboard accelerator over the same filter model.
- Per-Enrichment verdicts (ADR 0016 records the trade-off).
- A media library / storage inventory page (prototype variant B) — real,
  but its own effort.
