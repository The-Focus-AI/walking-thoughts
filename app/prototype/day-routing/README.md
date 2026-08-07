# PROTOTYPE — Day routing (end-of-walk dispatch)

Throwaway variants answering:

> When filing's primary verb becomes **"route this somewhere"** — Spec /
> To-do / Journal / Timeline / Drop — what shape makes the end-of-walk pass
> through the Day fast and obvious?

Not production. Fixture data only; agent handoffs, GitHub issues, the task
list, and the same-spot GPS cluster are all simulated stand-ins. Desktop-only
surface — this is the sit-down side of the app. Switcher hidden on the
production deployment.

## Run

```bash
mise run dev
```

Open:

- `/prototype` — hub with links
- `/prototype/day-routing?variant=A`

| Control | Action |
| --- | --- |
| ← → (arrow keys) | Cycle A → B → C |
| In variant A | `⏎` accept proposal · `s` Spec · `t` To-do · `n` Journal · `p` Timeline · `x` Drop · `j` skip |

## State model under test (shared by all variants)

- Every Thread arrives with a **proposed Route** (destination + Project
  guess) from the Enrichment, the way Kind and Project guesses ride today.
- Confirming or redirecting a Route marks the Thread **Reviewed as a side
  effect** — there is no separate "mark read" gesture.
- **Dispatch** commits the day: each destination shows where its Threads
  actually go (spec → repo issue via agent, to-do → task list + digest,
  journal → notebook, timeline → same-spot strip, drop → buried).
- Every variant shows a live readout: unsettled count, per-destination
  counts, dispatched or not.

## Variants

| Key | Name | Idea |
| --- | --- | --- |
| A | Dispatch deck | One Thread at a time, full attention. The proposal is pre-armed: Enter accepts, one key redirects, deck auto-advances. The pass ends on a dispatch summary, not an empty list. |
| B | Sorting lanes | The whole day at once as five destination lanes, pre-sorted with "?" cards. Move the wrong ones, confirm the rest, dispatch when every card is settled. Batch posture. |
| C | Day wrap sheet | The day arrives pre-written as a brief, sectioned by destination — "To spec out and hand off", "To get done", "For the notebook", "For the timeline". Reviewing is *reading*: veto or redirect the wrong lines, then "Accept the rest as written" and approve. |

### Round 2 — from the round-1 verdict (A wins; see VERDICT.md)

| Key | Name | Idea |
| --- | --- | --- |
| D | Bookended deck | A's deck stays the only working surface. B's lane view is demoted to the *bookends*: an arrival picture of what the day proposes ("Start routing →"), the one-at-a-time deck, then a departure picture of where everything goes, with undo per line and the Dispatch button. |

## Decision log (grilling session, 2026-08-07)

Per `docs/agents/design-md-process.md`: decisions are **user-confirmed** or
**derived recommendations** (veto-able — say the word and it flips).

| # | Decision | Status |
| --- | --- | --- |
| 1 | Filing's primary exit becomes **route, don't review** — destinations replace "mark read" as the desk's main verb; Reviewed is a side effect of routing. | **User-confirmed** |
| 2 | The deliberate destination set is **Spec / To-do / Journal** — plus **Timeline** flowing automatically for place/media Threads with GPS, and Drop for noise. "New project" is *not* a destination: Proposed Projects + the Interview already cover it. | Derived recommendation |
| 3 | **Spec** hands off: routing an idea to a Project with a repo drafts a ticket-shaped issue there (the Enrichment already produces ticket-shaped output for ideas) for a coding agent to pick up. | Derived recommendation |
| 4 | **To-do** stays lightweight: the task list + day digest checklist, no elaboration, external agent handoff later. | Derived recommendation |
| 5 | **Journal** absorbs questions *and* observations — the notebook where research reports live; `draftWorthy` flags the tweet/article candidates. Research Verdict (kept/dismissed) keeps working inside it. | Derived recommendation |
| 6 | **Timeline** is automatic, not a routing decision: same-spot detection by GPS radius (~25 m) clusters the daily photo into a strip; the walker only ever *removes* a frame. | Derived recommendation |
| 7 | The end-of-walk surface is the Day, not the whole queue — you cycle through *today*; the facet-rail desk (desk-processing.md) remains the cross-day catch-up surface. | Derived recommendation |
| 8 | Which shape (A / B / C) wins | **Open — this prototype's question** |

## Proposed glossary (NOT yet in CONTEXT.md — awaiting confirmation)

- **Route**: where a Thread goes when the walker settles it — Spec, To-do,
  Journal, Timeline, or Drop. Proposed by the Enrichment, settled at the
  desk; settling a Route makes the Thread Reviewed.
- **Dispatch**: committing a Day's confirmed Routes so each Thread actually
  leaves — the issue drafted, the task listed, the page filed, the frame
  added.

## What this implies for production (out of scope here)

1. **`ROUTE:` joins the front-matter contract** beside `TITLE:` / `KIND:` /
   `PROJECT:` — or is derived from Kind server-side (kind→route default
   table); the prototype assumes the Enrichment proposes it.
2. **`ThreadFiling` grows `route`** the way it grew `researchVerdict`;
   confirming any route sets `reviewedAt`.
3. **Spec handoff seam**: Project gains an optional repo; dispatch drafts an
   issue (ticket body = the Enrichment's idea-shaped report) — needs the
   GitHub seam and an ADR (hard to reverse: writes outside the system).
4. **Same-spot clustering**: Captures already carry GPS
   (`lib/local-capture/types.ts`); a spot is a stable cluster of photo
   Captures within a radius across days. Feeds the map journal.
5. **Journal surface**: the kept-research notebook — likely the existing
   `/journal` route growing sections rather than a new page.
