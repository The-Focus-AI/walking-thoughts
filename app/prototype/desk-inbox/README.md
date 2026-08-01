# PROTOTYPE — Desk inbox (desktop processing)

Throwaway variants answering:

> Back at the desk, what makes getting through unreviewed Threads fast —
> marking the note **processed** while keeping useful **research**, seeing
> what **media** is stored, and seeing **similar past Threads** while filing?

Not production. Fixture data only (including precomputed similarity scores
standing in for an embedding index). Switcher hidden on the production
deployment. Desktop-only surface — this is the sit-down side of the app.

## Run

```bash
mise run dev
```

Open:

- `/prototype` — hub with links
- `/prototype/desk-inbox?variant=A`

| Control | Action |
| --- | --- |
| ← → (or arrow keys) | Cycle A → B → C |
| In variant A | `j`/`k` next/prev · `r` keep research & done · `n` just done · `x` dismiss & done |

## State model under test (shared by all variants)

- **Thread**: `reviewed` (open → reviewed) plus confirmable `kind` and `project`.
- **Enrichment**: an independent verdict — `kept` / `dismissed` / unset — so
  "the research was useful" and "the note is processed" are separate facts.
- Every variant shows a live readout: queue remaining, research kept,
  dismissed, reviewed.

## Variants

| Key | Name | Idea |
| --- | --- | --- |
| A | Triage rail | Mail-client three-pane: queue list by day, one Thread in focus with filing controls, "Previously" similarity rail + mentions. Keyboard-first; filing auto-advances. |
| B | Light table | Media inventory first: storage stat strip, contact sheet of every attachment grouped by day (text-only Threads get dashed tiles), ringed = unreviewed. Filing happens in a drawer off the selected tile. |
| C | Batch ledger | Dense day-batched table: inline kind/project selects, keep/drop research cells, a "prior" column expanding the similarity trace, multi-select sweep bar and per-day "Sweep day". |

### Round 2 — from feedback on A–C

Feedback: A's keyboard is good; C's detail is right but too dense; need
back-and-forth with a Thread; grouping should not be locked to days.

| Key | Name | Idea |
| --- | --- | --- |
| D | Lens desk | One grouping control re-groups the same queue: Days / Topics (project or leading mention) / Kind / Media / Reports vs quick notes. Calm expandable rows instead of C's table; A's keys kept, plus `g` cycles the lens. |
| E | Dialogue desk | The Thread reads as a conversation — trail Capture, Enrichment, then desk Q&A turns. Suggested follow-up chips and a free-ask composer (simulated answers); filing is a compact header bar (Keep research / Mark reviewed). `j`/`k` switches Threads. |

## What this implies for production (out of scope here)

1. **Filing API grows one field.** `ThreadFiling` gains a research verdict
   (`kept` / `dismissed`) alongside `reviewed` / `kind` / `projectId`;
   kept reports are the natural candidates for Artifacts.
2. **Similarity needs an index.** Neon + pgvector on Capture + Enrichment
   text (embedded at sync/enrichment time), plus structured `mentions[]`
   returned by the gateway like `title`, so "prior" links can be exact
   (shared mention) with embedding similarity as fallback.
3. **Media inventory needs a listing seam.** Blob store listing keyed back
   to Capture/Thread with per-item size, powering the stat strip and
   orphan detection.
