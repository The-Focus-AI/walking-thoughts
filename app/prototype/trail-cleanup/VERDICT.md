# Verdict — trail cleanup prototype

**Picked:** Density **A** · Sync **C** · Map **A**

| Area | Winner | Name | Keep |
| --- | --- | --- | --- |
| Density | **A** | Sticky dock trail | No marketing hero; timeline is the page; Capture dock sticky (desktop: dock as side column) |
| Sync | **C** | Pulse gutter + footer | Fat per-row status gutter; sticky “Working on X of Y” + Retry |
| Map | **A** | Map as home hero | Offline Region map is the first plane; Capture / Thread below (desktop: map \| trail split) |

## Combined production intent

Home trail shell should compose these three — not ship the switcher:

1. **Map hero** fills the upper / left plane (install Offline Region here if missing; otherwise render + link through to Map Journal).
2. **Today’s Thread** with status gutters on each Capture; sticky sync footer for the rollup.
3. **Sticky Capture dock** in the thumb zone (side column on desktop).

Demote: marketing H1/lede, home `OfflineRegionPanel` text form, always-visible data-handling card, “Ready offline” as if it were sync health, Threads-by-day as the primary CTA.

## Primary source

Throwaway variants remain on branch `cursor/prototype-trail-cleanup-2da7` under
`/prototype` and `/prototype/trail-cleanup`.
