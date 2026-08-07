# PROTOTYPE — Day routing (end-of-walk dispatch)

One flow, three steps, answering:

> When filing's primary verb becomes **"route this somewhere,"** what does
> the end-of-walk pass through the Day feel like?

Not production. Fixture data only; agent handoffs, GitHub issues, the task
list, and the same-spot GPS cluster are simulated stand-ins. Desktop-only
surface. Earlier sketches (variants A–C and the first bookended cut) were
removed after the verdict — they live in git history on this branch
(commits `0f0a6ae`, `18bebe5`); VERDICT.md records the rounds.

## Run

```bash
mise run dev
```

Open `/prototype/day-routing` (or `/prototype` for the hub).

## The flow

| Step | Screen | What you do |
| --- | --- | --- |
| ① What came home | The day's Threads grouped by their proposed destination, with counts | Read it, hit **Start routing** (or `⏎`) |
| ② Route each one | One Thread per card: your words, the Enrichment's summary, its guess pre-armed | `⏎` accept the guess · or redirect with one key · repeat ~9 times |
| ③ Dispatch it | Everything under its destination with the concrete handoff spelled out | Undo anything wrong, then **Dispatch the day** (`⏎`) |

## Keys

| Key | Where | Action |
| --- | --- | --- |
| `⏎` | step ① | Start routing |
| `⏎` | step ② | Accept the proposed route (and advance) |
| `s` | step ② | Route to **Spec** (hand to a repo agent) |
| `t` | step ② | Route to **To-do** (task list, no ceremony) |
| `n` | step ② | Route to **Journal** (the notebook) |
| `p` | step ② | Route to **Timeline** (same-spot photo strip) |
| `x` | step ② | **Drop** (noise, buried) |
| `j` | step ② | Skip for now |
| `⏎` | step ③ | Dispatch the day |

Keys are inert while a select/input is focused.

## State model under test

- Every Thread arrives with a **proposed Route** from the Enrichment, the
  way Kind and Project guesses ride today.
- Confirming or redirecting a Route marks the Thread **Reviewed as a side
  effect** — there is no separate "mark read" gesture.
- **Dispatch** commits the day; until then every route is undoable at
  step ③.

## Where the decisions landed

- `docs/day-routing.md` — the spec (model, surface, slices R1–R3).
- `docs/adr/0017-filing-routes-instead-of-reviewing.md` — the settled
  core: route, don't review.
- `CONTEXT.md` — **Route** and **Dispatch** in the glossary; **Filing**
  reworded around them.
- VERDICT.md here — the round-by-round record.
