# Filing routes a Thread somewhere; Reviewed is the side effect

Every filing gesture at the desk ended at Reviewed, and one of 67 Threads
ever got there — not a discipline problem but a dead end: the desk asked
"did you read this?" when the walker's question was "what happens to this
next?" The walker's own groupings are destinations — a spec to try in a
repo that exists, a to-do to capture without ceremony, a notebook entry
that might become a post, the same-spot morning photo — so Filing's primary
verb becomes the **Route**: the Enrichment proposes one beside Kind and
Project, the walker confirms or redirects it at the desk, and settling the
Route is one gesture that both marks the Thread Reviewed and makes the
handoff happen — there is no separate commit step. (A batch "Dispatch"
gate was tried in the prototype and cut: it needed explaining, which is a
UI concept failing its one job. Undo covers the safety it was for.)

Two alternatives were considered and rejected. Keeping Reviewed as the exit
and adding destination surfaces that draw from Kind automatically leaves
the desk's question unchanged — the walker vetoed exactly that posture in
the round-1 prototype verdict ("a nice overview, but what are you supposed
to do with it"). Deriving the destination purely from Kind with no
per-Thread decision confuses the machine's reading with the walker's
intent: "Find that Will Self post" parses as a task and is an idea; kind is
what a Thread *is*, Route is what the walker *does* with it. The accepted
costs, recorded so nobody rediscovers them: a second settle-gesture family
beside the existing `r`/`n`/`x` until the desk converges on routes, and a
Route enum on the filing seam that each destination surface (task list,
journal, timeline, repo handoff) must grow into rather than find waiting.

The core decision — route, don't review — is walker-confirmed
(2026-08-07). The Route set itself (Spec / To-do / Journal deliberate,
Timeline automatic from GPS clustering, Drop for noise) is the current
recommendation, recorded with the rest of the provenance in
`docs/day-routing.md`; changing the set is a migration of one enum, not of
this decision.
