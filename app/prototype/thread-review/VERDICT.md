# Verdict — thread review prototype

**Picked:** Review **C** (Recap first) · Enrich — undecided

| Area | Winner | Name | Keep |
| --- | --- | --- | --- |
| Review | **C** | Recap first | Photo grid + aggregated follow-up checklist up top (with jump links back to the source Capture); dense full transcript below with annotations expanded inline |
| Enrich | — | _undecided_ | Candidates: A annotation card / B margin notes / C research dossier |

## Production intent (Review)

The Thread page becomes a review surface, not a chat:

1. **Recap header** — walk date, region, distance, and the stat strip
   (captures / photos / annotated / follow-ups).
2. **Photo grid** — every attachment in the Thread, up top.
3. **Follow-ups checklist** — aggregated from all Enrichments, each item
   linking back to the Capture it came from, with a one-tap "Ask" to spawn
   the research as a follow-up Capture. Requires follow-ups returned as
   structured data from the gateway (like `title`).
4. **Transcript** — all Captures in order, your words primary, Enrichments
   rendered as markdown with sources visible.
5. **Composer demoted** — "＋ New Capture (starts its own Thread)" is the
   default action; "Reply in this Thread" is the explicit secondary.

## Primary source

Throwaway variants live under `/prototype` and `/prototype/thread-review`
on branch `claude/session-co7apm` (PR #73).
