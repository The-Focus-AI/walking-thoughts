# An append-only Memory Patch log, written by Interview and Enrichment alike, tailors every Enrichment

Enrichments were generic: the same report whether the walker is a field
biologist or a first-time birder. We add Memories — durable facts about
the walker (identity, place, interest, expertise, preference) — injected
into every Enrichment prompt as a walker-profile block, with matching
system-instruction lines telling the model to skip known basics and go
deeper on stated interests.

The primary record is not the Memory but the **Memory Patch**: an
append-only log of add/update/remove operations, from which the current
Memory set is materialized. There is one write path
(`applyMemoryPatch`), and three writers use it: the **Interview** (seed
questions, then gateway follow-ups, capped at twelve turns, each answer
distilled into facts), the **Enrichment research loop** — which gains a
`memory_patch` tool beside `web_search`/`read_page` (ADR 0012) so the
model can revise the profile while writing a report — and manual
Forget/Revert.

We considered gating enrichment-learned facts behind user approval and
rejected it: patches **auto-apply**, and trust comes from visibility
instead — a Changes timeline on the Interview screen shows every diff
with its source, each patch has one-tap Revert (appending its inverse;
the log is never rewritten, echoing ADR 0001's append-only Threads), and
any Enrichment that patched the profile says so in a footer on the
report itself. A Memory-store outage degrades to an untailored report —
the tool answers `memory_unavailable`, the job never fails.

Two directions are deliberately deferred, and shaped for: everything is
keyed by `user_id` (multi-user is an allowlist change, not a migration),
and `applyMemoryPatch`/`revertMemoryPatch` are plain domain operations so
a future MCP/A2A surface — Walking Thoughts exposing Memories to other
agents, or consuming external tools — can wrap them without rework. That
choice of direction is intentionally unmade.

## Consequences

- `buildEnrichmentPrompt` carries the profile (Memory ids included, so
  the model can target update/remove) at run time — a patch applied by
  one Enrichment is visible to the next, independent of the frozen
  Thread basis.
- Repositories store only `memory_patches` (plus `interview_turns`),
  following the existing memory/Neon dual-implementation pattern; the
  current Memory set is replayed from the log on read.
- Enrichments persist the patches they made (`memory_patches` column) so
  the report footer and export stay honest.
- The Interview reuses the enrichment gateway seam, so dev/test stay
  offline via `createFakeGatewayClient`; the profile block is capped
  (40 Memories) to bound prompt growth.
