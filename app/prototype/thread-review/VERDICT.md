# Verdict — thread review prototype

**Picked:** Review **C** (Recap first) · Enrich **A** (Annotation card)

| Area | Winner | Name | Keep |
| --- | --- | --- | --- |
| Review | **C** | Recap first | Photo grid + open-Thread overview up top; dense entries below |
| Enrich | **A** | Annotation card | Markdown report leads; numbered source chips; research trace folded in a collapsible |

> **Superseded in part by ADR 0011** (every Capture starts its own Thread):
> the Recap-first layout was designed for a many-Capture Thread. Its ideas
> now land on the **Threads list grouped by day** (the walk view: photo
> grid + one dense row per Thread), while the Thread page slims to
> Capture + Enrichment (variant A) + conversation + export. The follow-up
> checklist concept was dropped — what follows a Capture is simply the
> model's report-style Enrichment.

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
