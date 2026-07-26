# Project-shaped facts leave the Memory log: the Enrichment proposes Projects, the Interview names them

Status: accepted. Supersedes the Interview half of ADR 0013 and narrows its
`memory_patch` contract; the append-only Memory Patch log itself stands.

A read of Production on 2026-07-26 — 25 Memory Patches, 20 live Memories, 4
Interview turns, 75 Threads, **0 Projects, 0 Threads filed** — showed the
walker profile had become the place Projects go to die. Eight of the 13
Enrichment-learned Memories name an effort rather than a fact: a token-pool
backend with "token factories" and "token resellers", focus.ai courses, a DGX
Spark at the office, a local-LLM benchmarking tool, a chat app that spins off
threads, a session dashboard. Two were added twice as separate Memories and
updated twice more, and two are visibly truncated mid-word by the 300-character
cap. Meanwhile the Interview's own output — seven Memories distilled from three
one-line answers, five of them restatements of each other — changed nothing
about any report, and the two most valuable Memories in the store ("Owns
Cornwall Market", "Lives near Cornwall Bridge, CT") were both learned by an
Enrichment reading a Capture, not by asking.

The leak is structural, not a prompting mistake. `KIND`, `TOPICS`, `ASK`, and
`PROJECT` all land on the Thread; `memory_patch` was the only tool that could
write something *global*, and `PROJECT:` is not even emitted when the walker's
project list is empty (`system-instruction.ts:94`), so an empty list can never
become non-empty. Project-shaped material had exactly one exit and took it.

So we draw the line where it actually falls: **a Memory is true whether or not
the walker ever acts on it.** Anything naming an effort, a build, a client, or
a product is a Project. The Enrichment keeps `memory_patch` under that narrowed
contract — it earned the slot, having produced the three best Memories in the
store — and gains a second exit for what it kept trying to say: it proposes a
**Proposed Project**, carried back into later prompts beside the walker's real
Projects so Thread #2 joins `Token Pool` instead of coining `token-metering`.
A Proposed Project accrues Threads in silence. At three, the Interview asks.

The Interview stops interviewing. Every question it asked — who are you, where
do you walk, what catches your eye — is answerable from a single Thread with
better evidence, and the in-Thread `ASK` shipped and does exactly that, in
context, at the moment the gap bites. What no Thread can see is that this is
the sixth walk circling the same thing. That cross-Thread question is the
Interview's whole remaining job: it presents the Proposed Project and its
Threads, and the walker names it or rejects it. It writes Projects, never
Memories.

## Considered options

- **Idea as a first-class record**, a proto-Project that Threads point at.
  Rejected: 10 of the 13 proposals correspond to exactly one Thread, so the
  entity would be a 1:1 wrapper around a Thread in almost every case, and the
  three that are not are the ones you would promote to Projects immediately.
  Idea stays what it already is — a Kind.
- **A periodic cross-corpus clustering pass** to find Projects. Rejected as
  redundant: the Enrichment already produced these eight proposals unprompted
  over two months. Free-form topic strings were tried and failed (236 slugs
  over 69 Threads; the four token-billing Threads came back as `token-cost`,
  `token-pool`, `billing`, `token-metering`), which is why proposals must be
  fed back into the prompt rather than re-derived from stored words.
- **Confirming a Project on the first Thread that proposes one.** Rejected:
  against this corpus it produces 13 Projects, 10 of them holding a single
  Thread — a second, worse copy of the Thread list. A threshold of three
  produces exactly the three efforts a human would name.
- **Naming a Project files its Threads.** Rejected: filing marks a Thread
  Reviewed, and knowing what a pile is called is not the same as having read
  it. The Project's existence and name are walker-settled; its membership
  stays the same unsettled guess the Enrichment already makes, and Filing at
  the desk settles it per Thread.
- **Retiring Memory entirely** for one editable profile paragraph. Rejected:
  "uses walk time to voice-dictate work ideas, not nature observations" is the
  single most valuable line in the store, no interview would have produced it,
  and the patch log is what makes an auto-applied machine-learned fact
  trustworthy.

## Consequences

- The Interview screen keeps its turn loop, gateway seam, and Changes
  timeline, and loses `SEED_QUESTIONS` and `extractMemoriesFromAnswer`. It has
  nothing to say to a walker with fewer than three Threads in any one effort;
  the empty state is the honest first run, and onboarding is not reintroduced.
- The three-Thread threshold is a tunable constant, not a fact of the model.
- A Proposed Project may be badly named early, having been coined from one
  Thread. Renaming is first-class, and the Interview's question is as much
  "what do you call this?" as "is this a Project?".
- Existing project-shaped Memories are removed by appending inverse patches
  (`scripts/revert-project-memories.mjs`), never by rewriting the log — ADR
  0013's Changes timeline then shows honestly that the system believed these
  were walker facts and that we changed our mind.
- Once a Project exists, `PROJECT:` starts being emitted for every subsequent
  Capture, so the guess loop that has been dead since launch turns over.
