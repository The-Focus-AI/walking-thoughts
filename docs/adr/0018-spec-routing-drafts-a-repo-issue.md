# Spec routing drafts one issue per Thread, and the record of it lives on the Thread

Routing a Thread to Spec is the first gesture that writes outside the
system: a ticket-shaped issue drafted in the Project's repository, title
from the Thread, body from the Enrichment's idea-shaped report. An
external write cannot be retried casually or deleted quietly, so three
questions are settled here before any seam ships.

**Idempotency.** One Thread earns at most one drafted issue, ever. The
guard is a handoff record stored on the Thread itself (`spec_handoff`):
once it says `drafted`, every later spec routing — a re-route, a retry, a
second device replaying the same gesture — returns that record instead of
drafting again. The stable key is derived from the Thread id
(`spec:<threadId>`) and travels in the issue body, so the GitHub drafter
can search for it before creating — that closes the crash window where
the issue landed but the record write did not. The alternative, keying on
the filing request or timestamp, was rejected because the same Thread
routed from the deck and from a desk row is one intent, not two. `skipped`
and `failed` records are deliberately *not* guards: they exist so the next
attempt can succeed once the Project has a repository or the outage ends.

**Failure visibility.** A draft that does not land is recorded on the
Thread as `failed` with its reason, returned in the filing response, and
shown where the Route was settled — never swallowed, and never allowed to
fail the filing itself: the Route and Reviewed still commit, because the
walker's decision is real even when GitHub is down. Routing to Spec when
the Project has no repository is not a failure but a `skipped` record: the
Route is kept, no external write happens, and the Thread says plainly that
the handoff is not live. The rejected alternative — refusing the spec
Route until a repository exists — would make an external service's
configuration a gate on the walker's own filing.

**Undo.** Un-routing reverses only what lives inside the system. If an
issue was already drafted, it stays in the repository — we never delete or
close external writes, because by then a coding agent may own it — and the
handoff record notes it was orphaned (`orphanedAt`), keeping the link so
the receipt can still name what exists. Routing back to Spec clears the
orphan note and reuses the same issue; it never drafts a second one.

Accepted costs, recorded so nobody rediscovers them: an orphaned issue in
a repo is the walker's to close by hand; a Thread whose title or report
improves after drafting does not update the issue (the draft is a
handoff, not a mirror); and until a server-side GitHub credential is
provisioned, the drafter behind the seam is the in-memory one — routing
records everything faithfully but no real issue appears, which the
`skipped`/`failed` visibility above makes plain rather than silent.
