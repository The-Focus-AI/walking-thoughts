# Thread classification and smarter Thread processing

A read of every Thread in Production as of 2026-07-24 — 67 Threads, 74
Captures, 66 Enrichments, 8 stuck jobs — and a proposal for what Thread
processing should do differently.

Today the pipeline treats every Thread identically: one system instruction
(`lib/enrichment/system-instruction.ts`), one tool set, one 8-step research
budget, one output shape (a cited markdown research report). The walker does
not capture one kind of thing, so a single shape is wrong most of the time.

## What is actually in the corpus

Seven kinds, hand-classified from every Capture text:

| Kind | Threads | What the Capture is | Examples |
| --- | --- | --- | --- |
| **Idea** | 25 (37%) | A thing to build later, dictated as a spec | "We should build pool as a token back end… token factories and token resellers"; "Ops repo + per-project repos + coding agents" |
| **Question** | 16 (24%) | A genuine lookup — identify, explain, find | "Why is it dark at night when there are so many stars"; "Why is the Honda Acty stalling out" |
| **Place** | 8 (12%) | A photo or a moment, no question in it | "Good morning cow"; "It's so beautiful in the morning"; "Morning coffee" |
| **Task** | 6 (9%) | Something to do, usually a call to make | "Make sure we call windwizer today"; "Call the doctor to schedule the colonoscopy and the blood work" |
| **Observation** | 5 (7%) | An opinion or aphorism looking for a foil | "The streams of tokens will wash away the differences"; "Podcaster asked the most inane question… 'Great question'" |
| **Media only** | 5 (7%) | Photo/audio/video with no text at all | Five Threads still titled `Thread` |
| **Noise** | 2 (3%) | Test entries | "Teating"; "Hello" |

Idea and Question together are 61% of the corpus, and they want opposite
things: a Question wants the outside world researched, an Idea wants the
walker's own half-formed thought sharpened and filed.

## How badly the single pipeline fits

Average Capture text vs. average Enrichment text per kind:

| Kind | n | avg Capture chars | avg Enrichment chars | expansion | no Enrichment | body lost |
| --- | --- | --- | --- | --- | --- | --- |
| Place | 8 | 24 | 2,454 | **102×** | 2 | 0 |
| Task | 6 | 60 | 2,791 | **46×** | 0 | 0 |
| Question | 16 | 111 | 3,598 | 33× | 0 | 0 |
| Observation | 5 | 171 | 2,095 | 12× | 0 | 0 |
| Idea | 25 | 280 | 3,341 | 12× | 0 | **5** |
| Media only | 5 | 0 | 0 | — | **5** | 0 |
| Noise | 2 | 336 | 2,506 | 7× | 0 | 0 |

The 33× expansion on Questions is the product working. The 102× on Places and
46× on Tasks is the product misfiring in the same direction: "Morning coffee"
earned a 2,172-character report, and "Make sure we call windwizer today" earned
2,012 characters of research when the walker wanted a phone number and a
reminder. Meanwhile the five media-only Threads earned nothing at all and are
still called `Thread` in the queue.

Downstream, the queue reflects this: **1 of 67 Threads is marked Reviewed.**
The review queue is a flat, undifferentiated list of 67 essays. There is
nothing to triage *with*.

## Five defects the corpus exposes

1. **Enrichment bodies are being thrown away.** Five Idea Threads (#56, #57,
   #58, #64, #65) have Enrichments of 127–245 characters that read like
   footnotes: *"Noted for future context — this capture was more of a
   'thinking-walk' product idea than a nature observation, so the report above
   leans technical."* There is no report above. `createAiSdkGatewayClient`
   returns `result.text` (`lib/enrichment/gateway.ts`), and the AI SDK defines
   that as *"the content generated in the last step."* When the model writes
   the report, then calls `memory_patch`, then adds a closing line, only the
   closing line is stored. This hits Idea Threads specifically because those
   are the ones that trigger a memory patch. **Fix: join text across
   `result.steps`.**

2. **A permanent failure is still retrying.** `isPermanentEnrichmentError`
   covers `missing_original_media_*` but not
   `model_anthropic/claude-sonnet-5_unsupported_media_video` — that job is at
   **2,627 attempts** and climbing. Seven media-gone jobs stopped at ~6,500
   attempts each. Both the permanent list and an absolute attempt ceiling are
   needed.

3. **Media-only Captures get no processing at all.** Five Threads with a
   photo, a video, or a voice note and no text produced zero Enrichments and no
   title. A vision/transcription-only pass would title and caption them.

4. **No cross-Thread awareness.** The token-cost idea is spread across four
   separate Threads (#45, #56, #57, #58) that never reference each other, each
   producing its own report. Habitats/agent infrastructure spans five (#22,
   #23, #40, #47, #48); focus.ai courses/newsletter/labs spans six. The walker
   is developing a handful of ideas across many walks, and the system files
   each walk as a stranger.

5. **The walker profile is accumulating duplicates.** Of 25 Memory Patches,
   "wants a shared token pool backend" was added twice as separate Memories
   and updated twice more; "uses walks to think through product ideas" exists
   three times in slightly different words. `memory_patch` offers `add` and
   `update` with no similarity check, and `add` is the path of least
   resistance.

## Proposal: classify first, then process by kind

### 1. Classify in the Enrichment call, not before it

Extend the front-matter contract in `parseGatewayText` from `TITLE:` alone to a
small block the model emits before the body:

```
TITLE: Token pool as a billing backend
KIND: idea
TOPICS: token-billing, litellm, focus.ai
ACTIONS: Compare LiteLLM vs AI Gateway for per-user token accounting
```

No extra round trip, no extra cost. `KIND` is one of `question | idea | task |
observation | place | media | noise`. Persist `kind` and `topics` on
`sync_threads` (nullable columns, backfilled — see step 6) and on the
Enrichment row, since a Thread's kind can change as Captures are appended.

### 2. Route the system instruction, tool set, and step budget by kind

`enrichmentSystemAndModel` currently returns one system string. Make it
`instructionForKind(kind)` over a base + per-kind profile:

| Kind | Output shape | Tools | Step budget |
| --- | --- | --- | --- |
| Question | Today's cited research report | search + read | 8 |
| Idea | One-paragraph restatement, prior art, open questions, related Threads — ticket-shaped | search (2 max) + memory | 4 |
| Task | The action, the contact, hours/phone if findable. 3 sentences, no essay | search (1 max) | 2 |
| Observation | A short response that argues back, names the idea if it has a name, no forced citations | search optional | 3 |
| Place | Identification and a caption, place name, one fact worth knowing | search (1 max) | 2 |
| Media only | Caption/transcribe what is actually there; title the Thread | vision/audio, no search | 1 |
| Noise | Skip. Mark the Thread `noise`, keep it out of the review queue | none | 0 |

This is also a cost lever: the classification says outright that 21 of 67
Threads (Task, Place, Media, Noise) never needed an 8-step research loop.

The first pass can be prompt-only — one instruction that names the kinds and
tells the model to pick a register — before wiring per-kind tool sets. That
alone fixes the 102× Place expansion.

### 3. Give each kind a real destination

Classification is only worth it if the kinds go somewhere:

- **Task** → a checklist surface, and into the day digest as `- [ ]` items.
  `DAY_DIGEST_SYSTEM_INSTRUCTION` already knows how to emit checklists; it
  should draw from Threads classified `task` rather than re-deriving them.
- **Idea** → an idea board grouped by topic cluster, with "open as GitHub
  issue" (the walker's ideas are already ticket-shaped when dictated).
- **Question** → today's Enrichment report, unchanged.
- **Observation** → a "draft-worthy" flag. Thread #43 asks for exactly this:
  *"a good workflow… to extract and synthesize something into a tweet and then
  get that posted."*
- **Place** → the map journal, with the caption as the marker label.

### 4. Link Threads on shared topics

With `topics` stored, before enriching, look up other Threads sharing a topic
and pass their titles and one-line summaries into the prompt. Two payoffs:
the report opens with "this continues #45 and #57" instead of restarting cold,
and the review queue can group the four token-billing Threads into one card
with a merge action.

### 5. Make the review queue kind-aware

Group `threads-queue` by kind with counts, add bulk "mark reviewed," and give
each group the action its kind implies (Task → check off, Idea → open issue,
Place → view on map). One-of-67 reviewed is a triage problem, not a discipline
problem.

### 6. Backfill

Run one classification-only pass over the 67 existing Threads (title + kind +
topics, no research) to populate the new columns, so the new surfaces have
content on day one rather than starting empty.

## What has shipped

Steps 1 and 2 of the order below are implemented:

- **Defect 1 fixed.** `collectGeneratedText` in `lib/enrichment/gateway.ts`
  joins the text of every step, so a report followed by a `memory_patch` call
  survives.
- **Defect 2 fixed.** `lib/enrichment/failures.ts` names both permanent
  classes — missing media and media the job's model cannot read — and adds a
  `MAX_ENRICHMENT_ATTEMPTS` backstop for failures no pattern anticipates. Both
  repositories honour it, and `needs_attention` results now report
  `retryable` honestly instead of always `true`.
- **Unsupported media is recoverable.** A job's model is frozen at queue time,
  so a permanently-failed job under an *old* model no longer blocks the
  Thread: pointing `AI_GATEWAY_MODEL` at a model that reads the attachment
  queues a fresh, model-scoped job. Every other Thread keeps its stable
  idempotency key, so changing models never re-enriches work that already
  succeeded. Image is the only axis this rescues — checked 2026-07-26, no
  gateway language model reads audio or video, so audio is transcribed before
  the model sees it (ADR 0015) and a video Capture has no model to switch to.
- **Classification contract.** The model now opens each Enrichment with
  `TITLE` / `KIND` / `TOPICS` header lines; `parseGatewayText` splits them off
  the body, ignores an invented kind, and slugs topics. `kind` and `topics`
  persist on the Enrichment row (`ALTER TABLE enrichments` in the Neon
  repository) and ride through `ThreadEnrichment`.
- **Register guidance.** `DEFAULT_ENRICHMENT_SYSTEM_INSTRUCTION` names all
  seven kinds and what each one wants back, and tells the model to let length
  follow the Capture.

- **The Thread carries its own kind.** `sync_threads` holds `kind` and
  `topics`, `completeJob` records the newest Enrichment's verdict through
  `updateThreadClassification`, and hydration adopts both the way it adopts
  the review decision — neither enriching nor marking reviewed bumps the
  revision, so an unconditional adopt is the only thing that works.
- **The queue reads by kind.** A kind strip above the day strip filters the
  list and counts each kind; every row names its kind in the machine's sky,
  never the walker's italic. Desk order puts *To do* first, and tapping the
  active kind clears the filter.

- **It asks instead of guessing.** "Goldin scope" was not a garbled
  observatory — it was a reminder to write a scope of work for a client named
  Goldin, and nothing in the walker profile could have told the model that.
  The instruction now forbids substituting a public subject that merely sounds
  similar: an unrecognized name produces an `ASK` header with one specific
  question, an omitted or `unclear` kind, and a report limited to what can
  honestly be said. The question rides on the Thread, shows as **Needs a word**
  in the queue and its own filter chip, and appears above the reply composer —
  answering is an ordinary reply Capture, which re-enriches the Thread and
  clears the question. An Enrichment that still cannot tell leaves the prior
  kind standing rather than erasing it.
- **The day has a sheet.** Selecting a day opens with what the day *is* before
  any question is asked: Threads, Captures, media, reviewed, the kind
  breakdown, everything needing a word, and the day's to-dos — computed from
  local state, so it paints instantly and works out of range.

- **Threads get filed into Projects.** A Project is a named bucket — an
  effort, a client, a build — and a Thread belongs to at most one. The
  Enrichment guesses one, but only from the list the walker has already made
  (`PROJECT:` header, matched by name; an invented name is dropped), and the
  guess reads with a question mark until the walker settles it. **Filing** is
  the desk action: confirm the guessed kind, put it in a Project, or just mark
  that you read the report. Any of those makes the Thread Reviewed and clears
  it from New, so the sitting-down-afterwards is done when New is empty. A
  walker's filing is final — no later Enrichment overrules it.

Still open: per-kind tool sets and step budgets, an all-days overview with
real themes, and Memory dedup. The per-kind destinations (checklist, idea
board, map) grew into their own effort — `docs/day-routing.md` makes the
destination a first-class **Route** the walker settles at the desk
(ADR 0017), rather than a surface each kind drains into. Topic linking is superseded for grouping: 238 free-form slugs
across 70 Threads never clustered, and Projects are the walker's own answer to
the same question. The Interview
now overlaps the in-Thread question: both exist to teach the system about the
walker, and the Thread version arrives in context, at the moment the gap
actually bites.

## What the backfill produced

`scripts/classify-threads.mjs` classified all 69 production Threads (67 above
plus two from the following morning) with `anthropic/claude-sonnet-5`, writing
`kind` and `topics` onto both the Thread and its latest Enrichment, and
retitling the 12 Threads whose titles were auto-derived — five placeholder
`Thread` rows and seven 80-character sentence fragments became
"Untitled Video Capture", "Token pool as pluggable backend",
"Standardize token cost tracking per user/agent", and so on.

| Kind | Model | Hand-classified above |
| --- | --- | --- |
| question | 23 | 16 |
| idea | 20 | 25 |
| task | 8 | 6 |
| place | 8 | 8 |
| media | 5 | 5 |
| observation | 4 | 5 |
| noise | 1 | 2 |

Three things the run shows:

1. **The model reads grammar where intent matters.** Places and media agree
   exactly; the disagreement is entirely inside the work Threads. "Let's
   figure out a growth plan for the focus newsletter" became a *question*
   because it is phrased as one, and "Find that Will Self post…" became a
   *task* because it starts with an imperative — both are ideas the walker
   wants to work on later. The register guidance should say that explicitly:
   what decides idea vs. question is whether the answer lives in the world or
   in the walker's own project.
2. **A false `noise` is the expensive error.** "Goldin scope" — a garbled
   dictation of Goldendale Observatory — was classified `noise`, and noise is
   the one kind the proposal hides from the queue. Worth a guard: never
   `noise` when the Thread already carries a substantive report.
3. **Free-form topics do not cluster.** 236 distinct slugs across 69 Threads,
   only 20 shared by more than one Thread, and most of those are incidental
   (`fog`, `photo`, `location`). The four token-billing Threads came back as
   `token-cost`, `token-pool`, `billing`, and `token-metering` — the cluster
   the corpus obviously contains, split four ways. Topic linking needs the
   existing vocabulary passed into the prompt with an instruction to reuse a
   slug that already fits, or grouping by embedding rather than by string.

## Suggested order

1. **Fix the two reliability bugs first** — multi-step text join and the
   permanent-failure guard. Defect 1 is silently destroying the walker's most
   valuable output, and it costs a one-line change plus a test.
2. Prompt-only kind routing, with `KIND` and `TOPICS` parsed and persisted.
3. Backfill classification over the existing corpus.
4. Kind-aware review queue and digest.
5. Media-only caption pass.
6. Per-kind tool sets and step budgets.
7. Topic linking and Memory dedup on `memory_patch`.
