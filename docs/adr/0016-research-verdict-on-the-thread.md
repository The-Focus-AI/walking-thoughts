# The Research Verdict is one field on the Thread, and dismissing retracts the Artifact

Reviewing needed to separate two facts that one `reviewed` flag had fused:
"I have processed this note" and "this research was worth keeping." The
verdict — kept / dismissed / unset — could have lived on each Enrichment
(precise: a Thread's report can be junk while a later answer is gold, and
Threads accrue Enrichments forever under ADR 0001) or on the Thread as part
of Filing. We put it on the Thread: one more field on `ThreadFiling` and
`/api/sync/review`, no new repository surface, and it matches how the desk
actually files — one gesture per Thread (`r`/`n`/`x`), not a per-entry
editorial pass. The accepted cost, recorded so nobody rediscovers it: if the
Dialogue view ever needs per-answer keeps, that is a real migration, not a
tweak.

Dismissing also does something visible: it retracts the Thread's Artifact
page. ADR 0014 publishes reports before review so the page is waiting at the
desk — that stands — but a page whose research the walker read and let go
should stop resolving, and keeping the research again restores it at the
same address. The alternative (verdicts never touch Artifacts) kept
publication purely append-only but made "dismissed" cosmetic; the other
alternative (publish only on keep) reversed ADR 0014's premise that the page
you want ready is exactly the not-yet-reviewed one. Thread history itself
stays append-only in every case — a dismissed report renders collapsed,
never deleted.
