# Verdict — design directions prototype

**Picked: a — Forest Night**, with named steals from the losers. This is the
direction distilled into the root `DESIGN.md`.

Judged unattended against the decision log in [README.md](README.md) (calm
instrument, never urgency; honest status; dark-first; warm; system fonts;
WCAG AA), the shipped identity, and the prior trail-cleanup / thread-review
verdicts. Screenshots of all four directions (mobile + desktop) were taken
via Playwright and compared; every text/background pair in the winner was
measured for contrast (all pass AA, nearly all AAA — table in `DESIGN.md`).

| Key | Name | Outcome | Why |
| --- | --- | --- | --- |
| a | Forest Night | **Winner** | Continuous with the shipped identity; the five-role accent system (moss / sun / clay / sky / record red) keeps status honest without alarm; calm at dawn; every pair ≥ 6.2:1. |
| b | Field Notebook | Lost | Warm paper is lovely at the desk but a light default fails the dawn-trail test (flash-blind at 6am, OLED battery) and removing card chrome flattened `Needs attention` rows into the page. |
| c | Instrument Panel | Lost | Honest but not calm: cool ground + signal orange + amber reads tactical, violating "never urgency"; action-orange and attention-amber collide as neighbors in hue; all-mono display type shouts. |
| d | Ranger Duotone | Lost | Poster charm, but the duotone collapses the role system — the machine's voice and the walker's identity become the same pine, and the "one gold accent" ends up doing action *and* attention duty. Display-900 uppercase is signage, not a companion. |

## Steals folded into DESIGN.md

- **From b (Field Notebook):** ruled (hairline-separated) lists instead of
  card-per-row on desk review surfaces; `line-height: 1.6` for long-form
  Enrichment reading; opacity/muted discipline — de-emphasize with the muted
  ink, never a new hue. Paper values earmarked for future print/Markdown
  export of Threads.
- **From c (Instrument Panel):** the mono microtype status gutter (time above
  status label, always both) as the canonical honesty pattern; monospace for
  every machine fact — timestamps, coordinates, model IDs, counts, file
  sizes.
- **From d (Ranger Duotone):** one-primary-action-per-viewport restraint —
  sun is reserved for the single primary act on screen; confident,
  full-width empty states rather than apologetic gray boxes.

## Primary source

Throwaway variants live under `/prototype/design-directions` on branch
`claude/design-md-brand-system-mlwfw8` alongside the `DESIGN.md` this
prototype settled. Winner is flagged on the `/prototype` hub.
