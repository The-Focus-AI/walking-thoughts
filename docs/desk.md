# The desk: one pile, one gesture

Walks produce Threads; the desk is where they get settled. This is the one
spec for that — it merges what were briefly two documents
(`desk-processing.md`, the queue-and-rail effort, and `day-routing.md`,
the end-of-walk flow) after the walker called the split: *"there should
only be one of those things."*

The system in one paragraph: a Capture starts a Thread on the trail; the
Enrichment works it over on the way home and proposes a title, a Kind, a
Project, and a **Route** — where the Thread should go. Back at the desk
the walker settles each Route: one gesture that marks the Thread Reviewed
*and* does the thing — the issue drafted in a repo, the task put on the
list, the page filed in the notebook, the photo added to the same-spot
timeline, the noise buried. No separate "mark read," no commit gate,
receipts instead of confirmations. Everything else at the desk — the
facet rail, the Lenses, similarity, the Dialogue view — exists to *find
and read* Threads, never as a second way to settle them.

## Decisions and their provenance

Per `docs/agents/design-md-process.md`: **user-confirmed** or **derived
recommendation** (open veto). The prototype record is
`/prototype/day-routing` (this round) and `/prototype/desk-inbox` (the
rail round); verdicts in each folder's VERDICT.md.

| Decision | Status |
| --- | --- |
| Filing's primary verb is the **Route** — Reviewed is a side effect of settling it. | **User-confirmed** (grill Q1, 2026-08-07) |
| The pass is **one Thread at a time**, bookended by an arrival picture and a receipts picture. A whole-day lane view is never a working surface. | **User-confirmed** (prototype rounds 1–2) |
| **One system.** The rail and Lenses find Threads; routing settles them — the same gesture on a desk row as on a deck card. The old `r`/`n`/`x` filing is superseded: `x` dismiss → Drop, `r` keep research → Journal, `n` just-reviewed → gone. | **User-confirmed** ("there should only be one of those things" / "give it one pass so it's unified") |
| **No commit gate.** Settling a Route does it immediately; the closing screen is a receipt with per-line undo. | Derived from the walker's reaction ("what does Dispatch the day mean?") |
| **Reports are readable in the flow** — on the routing card and in the notebook, not just a one-line summary. | Derived from the walker's reaction ("it doesn't tell me the reports") |
| The Route set: **Spec / To-do / Journal** deliberate, **Timeline** automatic for GPS-clustered photos, **Drop** for noise. "New project" is not a Route — Proposed Projects + the Interview cover it. | Derived recommendation |
| **Spec** routing drafts a ticket-shaped issue in the Project's repo for a coding agent. | Derived recommendation |
| **Journal** absorbs questions and observations; draft-worthy entries are flagged as post candidates. | Derived recommendation |
| **Timeline** spots are stable clusters of photo Captures within ~25 m across days; the walker only ever removes a frame. | Derived recommendation |

## The gesture: Route

- The Enrichment proposes a Route beside `TITLE:` / `KIND:` / `PROJECT:` —
  a `ROUTE:` header eventually; first slice, a server-side default from
  Kind (question → journal, idea → spec, task → todo, observation →
  journal, place → timeline, media → journal with its Needs-a-word
  question, noise → drop).
- Settling a Route — accepting the proposal or redirecting it — is one
  write: `route` and `reviewedAt` together, and the handoff happens right
  then. Undo reverses it while the walker is still at the desk; afterwards
  the destination surface owns the object.
- The Research Verdict (ADR 0016) is implied rather than asked: Journal
  keeps the research and its Artifact page; Drop lets it go and retracts
  the Artifact at its address. The field stays on the Thread as before.
- A walker's Route, like the rest of Filing, is final — no later
  Enrichment overrules it.
- Kind is what a Thread *is*; Route is what the walker *does* with it
  (ADR 0017).

## The default door: the Day flow

Prototyped end-to-end at `/prototype/day-routing`:

1. **What came home.** The Day opens on a lane summary of the proposals —
   counts and titles per Route, Needs-a-word flagged — and one action:
   Start routing.
2. **Route each one.** One Thread at a time: the walker's words, the
   Enrichment summary, the full report readable in place (`r`), media
   with its GPS, the proposed Route pre-armed with what settling it will
   do. `⏎` accepts; `s`/`t`/`n`/`p`/`x` redirect; `j` skips. Settling
   does the handoff and auto-advances. Spec routes carry the Project
   select.
3. **What happened.** Receipts, not a gate: the drafted issues with repos
   named, the task list as it now looks, the notebook pages with readable
   reports, the timeline strip, the dropped line — undo per line, nothing
   left to press.

## The finder: rail, Lenses, and the backlog

Carried over from the rail effort (built as `components/desk-rail.tsx` +
`lib/desk/facets.ts`): the facet rail's counted groups (State, Attention,
Kind, Project, Media, Reports) filter the pile, a Lens re-stacks whatever
they let through, selections are URL-carried, and the phone renders the
same filter model as chips. All of it *finds*. A backlog Thread found
this way is settled with the same routing gesture as a deck card — there
is no batch mode and no second verb. The Dialogue view (the Thread page
as a conversation) remains the place to go deeper before routing.

## Slices

Strictly ordered; each ships alone. Earlier desk work already shipped:
the queue/rail surface, structured mentions, similarity retrieval into
the prompt, and the Dialogue view.

### D1 — Route on the filing seam, and the Day flow

Built only on data the app already holds, no prompt changes:

- `ThreadFiling` (`lib/sync/review-client.ts`) and `/api/sync/review`
  grow `route: "spec" | "todo" | "journal" | "timeline" | "drop" | null`;
  the Neon repository and local store carry it; hydration returns it.
  Settling a route sets `reviewedAt` in the same write.
- The kind→route default table lives server-side; the deck shows it as
  the proposal.
- The Day view (`/days/[dayKey]`) gains the three-step flow for its
  unrouted Threads; desk rows gain the same route actions. In D1 settling
  a route *records* it — the receipts screen says plainly which handoffs
  are live and which land with a later slice.

Acceptance (public browser seam, per repo verification style):

- A Day with unrouted Threads opens on the arrival summary; Start routing
  shows the first card; `⏎` settles it with the proposed route and
  advances; the readout drops.
- Redirecting with `t` files the Thread `todo` + Reviewed in one write;
  reload shows it settled.
- Routing the same Thread from a desk row and from the deck produces the
  same filing.
- The receipts screen lists every Thread under its route; undo returns it
  to the deck; when nothing is left to route, New is empty for that Day.

### D2 — The destinations that live in the app

- **To-do:** a task-list surface fed by `route = todo`;
  `DAY_DIGEST_SYSTEM_INSTRUCTION` draws its checklist from routed to-dos
  instead of re-deriving them.
- **Journal:** the notebook — `route = journal` Threads with their
  reports; the existing `/journal` route grows sections; draft-worthy
  flags surface post candidates.
- **Timeline:** same-spot clustering over photo Captures' GPS
  (`lib/local-capture/types.ts` already carries lat/lon); a spot is a
  stable ≤25 m cluster across days; the strip renders on the map journal
  with day count and per-frame distance.

### D3 — Spec routing leaves the system

`Project` gains an optional repo. Routing a spec drafts a ticket-shaped
issue there (the body is the Enrichment's idea-shaped report) and hands
it to a coding agent. Writes outside the system are hard to reverse —
this slice opens with its own ADR settling idempotency, failure
visibility, and batching.

## Out of scope

- Re-routing after the Day is closed — undo lives while it's open at the
  desk; afterwards the destination surface owns the object.
- Auto-routing without the walker's pass; the deck is deliberately a
  human moment.
- Per-Enrichment verdicts (ADR 0016 records the trade-off), a media
  library page, and a token/command box — same standing exclusions as
  before.
