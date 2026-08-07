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
| ② Route each one | One Thread per card: your words, the summary, the full report readable in place (`r`), the guess pre-armed | `⏎` accept the guess · or redirect with one key. Routing it **does it** — there is no later commit step |
| ③ What happened | The receipts: issues drafted (repo named), your list as it now looks, notebook pages with readable reports, the timeline strip | Nothing — read it, undo anything wrong, close the tab |

## Keys

| Key | Where | Action |
| --- | --- | --- |
| `⏎` | step ① | Start routing |
| `⏎` | step ② | Accept the proposed route (and advance) |
| `s` | step ② | Route to **Spec** (drafts an issue in the Project's repo) |
| `t` | step ② | Route to **To-do** (puts it on the task list) |
| `n` | step ② | Route to **Journal** (files it in the notebook) |
| `p` | step ② | Route to **Timeline** (adds the frame to the strip) |
| `x` | step ② | **Drop** (noise, buried) |
| `r` | step ② | Read the full report in place |
| `j` | step ② | Skip for now |

Keys are inert while a select/input is focused.

## State model under test

- Every Thread arrives with a **proposed Route** from the Enrichment, the
  way Kind and Project guesses ride today.
- Settling a Route **does it immediately**: the Thread is Reviewed and the
  handoff happens right then (simulated). No separate commit step —
  "Dispatch" as a button was cut in round 3 after it needed explaining,
  which is a UI concept failing its one job.
- Step ③ is a **receipt**, not a gate; undo pulls a Thread back into the
  deck.

## Where the decisions landed

- `docs/day-routing.md` — the spec (model, surface, slices R1–R3).
- `docs/adr/0017-filing-routes-instead-of-reviewing.md` — the settled
  core: route, don't review.
- `CONTEXT.md` — **Route** and **Dispatch** in the glossary; **Filing**
  reworded around them.
- VERDICT.md here — the round-by-round record.
