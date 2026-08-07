# Day routing: filing becomes route, not review

The sitting-down-afterwards had a dead end in it: every filing gesture —
keep research, just reviewed, dismiss — terminated at Reviewed, and nothing
left the system. The walker's own account of the overwhelm named the real
shape of the pile: a thought is a spec to try in a repo that exists, a
to-do to capture without ceremony, a question or observation for the
notebook that might become a post, or the same-spot morning photo. Those
are not categories to browse; they are places things go. A desk that shows
everything and implies no action *is* the overwhelm.

This spec is the emerging answer, arrived at by a grilling session and two
prototype rounds (all four throwaway variants live under
`/prototype/day-routing`; verdicts in that folder's VERDICT.md, decision
log with provenance in its README). It concretizes step 3 of
`thread-classification.md` ("give each kind a real destination").

## Decisions and their provenance

Per the process in `docs/agents/design-md-process.md`: decisions are
**user-confirmed** or **derived recommendations** (open vetoes).

| Decision | Status |
| --- | --- |
| Filing's primary verb is the **Route** — Reviewed becomes a side effect of settling it. | **User-confirmed** (grill Q1, 2026-08-07) |
| The pass is **one Thread at a time** (prototype A), bookended by an arrival picture of what the day proposes and a departure picture of where it goes (variant D). A whole-day lane view is never a working surface. | **User-confirmed** (round-1 verdict + round-2 direction) |
| The Route set: **Spec / To-do / Journal** deliberate, **Timeline** automatic for GPS-clustered photos, **Drop** for noise. "New project" is not a Route — Proposed Projects + the Interview already cover it. | Derived recommendation |
| **Spec** dispatch drafts a ticket-shaped issue in the Project's repo for a coding agent. | Derived recommendation |
| **Journal** absorbs questions and observations; draft-worthy entries are flagged as post candidates; the Research Verdict keeps working inside it. | Derived recommendation |
| **Timeline** spots are stable clusters of photo Captures within ~25 m across days; the walker only ever removes a frame. | Derived recommendation |
| The end-of-walk surface is the **Day**; the facet-rail desk (`desk-processing.md`) remains the cross-day catch-up surface. | Derived recommendation |

## The model

**Route** is one more thing the Enrichment proposes and the walker settles,
exactly like Kind and Project today:

- The Enrichment proposes a Route beside `TITLE:` / `KIND:` / `PROJECT:` —
  either a `ROUTE:` header, or (first slice, no prompt change) a
  server-side default from Kind: question → journal, idea → spec,
  task → todo, observation → journal, place → timeline, media → journal
  with its Needs-a-word question, noise → drop.
- Settling a Route — confirming the proposal or redirecting it — is what
  makes the Thread Reviewed. There is no separate "mark read" gesture.
- **Dispatch** commits a Day's confirmed Routes: each Thread actually
  leaves — the issue drafted, the task listed, the page filed, the frame
  added, the noise buried. Until Dispatch, everything is undoable at the
  departure picture.
- A walker's Route, like the rest of Filing, is final — no later
  Enrichment overrules it.

## The surface (prototype variant D)

The Day view becomes the bookended deck:

1. **Arrival — "what came home."** The Day opens on a lane summary of the
   Enrichment's proposals (counts and titles per Route, Needs-a-word
   flagged) and one action: Start routing.
2. **The deck.** One Thread at a time: the walker's words, the Enrichment
   summary, media with its GPS, the proposed Route pre-armed with its
   handoff spelled out. Enter accepts; `s`/`t`/`n`/`p`/`x` redirect to
   Spec / To-do / Journal (notebook) / Timeline (photo) / Drop; `j` skips.
   Settling auto-advances. Spec routes carry the Project select.
3. **Departure — "where it went."** The same lane picture, now settled:
   every Thread under its Route with its concrete handoff
   (Welton spec → `the-focus-ai/welton`), undo per line, and Dispatch.

## Slices (strictly ordered, each ships alone)

### R1 — Route on the filing seam, and the bookended deck

Built only on data the app already holds, no prompt changes:

- `ThreadFiling` (`lib/sync/review-client.ts`) and `/api/sync/review` grow
  `route: "spec" | "todo" | "journal" | "timeline" | "drop" | null`;
  the Neon repository and local store carry it; hydration returns it.
  Settling a route sets `reviewedAt` in the same write.
- The kind→route default table lives server-side; the deck shows it as the
  proposal. (The `ROUTE:` front-matter header can replace the table later
  without touching the seam.)
- The Day view (`/days/[dayKey]`) gains the three-phase deck for its
  unrouted Threads. Dispatch in R1 records the routes — the per-Route
  handoffs are R2/R3; the departure picture says plainly which handoffs
  are live and which are "recorded, lands with a later slice."

Acceptance (public browser seam, per repo verification style):

- A Day with unrouted Threads opens on the arrival summary; Start routing
  shows the first card; Enter settles it with the proposed route and
  advances; the readout's unsettled count drops.
- Redirecting with `t` files the Thread `todo` + Reviewed in one write;
  reload shows it settled.
- The departure picture lists every Thread under its route; undo returns
  one to the deck; Dispatch marks the Day dispatched and the queue's New
  is empty for that Day.

### R2 — The destinations that live in the app

- **To-do:** a task-list surface fed by `route = todo`;
  `DAY_DIGEST_SYSTEM_INSTRUCTION` draws its checklist from routed to-dos
  instead of re-deriving them.
- **Journal:** the notebook — `route = journal` Threads with their reports;
  the existing `/journal` route grows sections; draft-worthy flags surface
  post candidates (Thread #43's ask).
- **Timeline:** same-spot clustering over photo Captures' GPS
  (`lib/local-capture/types.ts` already carries lat/lon); a spot is a
  stable ≤25 m cluster across days; the strip renders on the map journal
  with day count and per-frame distance.

### R3 — Spec dispatch leaves the system

`Project` gains an optional repo. Dispatching a spec drafts a ticket-shaped
issue there (the body is the Enrichment's idea-shaped report) and hands it
to a coding agent. Writes outside the system are hard to reverse — this
slice opens with its own ADR settling idempotency, failure visibility, and
whether Dispatch batches or streams the handoffs.

## Out of scope

- Re-routing after Dispatch (undo lives before it; afterwards the
  destination surface owns the object).
- Cross-day routing sweeps — the facet-rail desk keeps that job.
- Auto-dispatch without the walker's pass; the deck is deliberately a
  human moment.
