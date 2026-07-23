# Memories learned in an Interview tailor every Enrichment

Enrichments were generic: the same report whether the walker is a field
biologist or a first-time birder. We add a Memory system — durable facts
about the walker (identity, place, interest, expertise, preference) stored
per user — and inject them into every Enrichment prompt as a rendered
walker-profile block, with a matching system-instruction line telling the
model to skip known basics and go deeper on stated interests. Memories are
learned in an Interview: Walking Thoughts asks seed questions first (who,
where, what draws attention, what's already known, report taste), then
gateway-generated follow-ups grounded in earlier answers, capped at twelve
turns. Each answer is distilled into `MEMORY[category]: fact` lines by the
same gateway model that writes Enrichments; when distillation yields
nothing (including the fake dev gateway), the raw answer is kept whole
under the question's category so nothing said is lost. We considered
mining Memories silently from Capture history instead of asking, and
rejected it for now: an explicit Interview keeps the walker in control of
what the system believes about them, matches the app's visible-processing
principle (ADR 0003), and produces facts the walker actually endorsed.

Every Memory stays visible on the Interview screen and can be forgotten
with one tap; forgetting deletes the row, and the next Enrichment simply
renders a smaller profile. A Memory-store outage degrades to an untailored
report, never a failed Enrichment job.

## Consequences

- `buildEnrichmentPrompt` gains an optional walker-profile section; jobs
  read the profile at run time, so a Memory learned between queueing and
  running still applies (the frozen basis covers Thread history only).
- Two new repositories (`walker_memories`, `interview_turns`) follow the
  existing memory/Neon dual-implementation pattern keyed by
  `DATABASE_URL`.
- The Interview reuses the enrichment gateway seam, so dev/test stay
  offline via `createFakeGatewayClient` and no new provider is added.
- The profile block is capped (40 Memories) to bound prompt growth.
