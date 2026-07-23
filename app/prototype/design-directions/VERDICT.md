# Verdict — design directions prototype

Three rounds. Final language: **Quadrangle over Forest Night tokens, with
the V1 station strip**, distilled into the root `DESIGN.md`.

## Round 1 — color & atmosphere (unattended)

**Picked: a — Forest Night**, with named steals from the losers.

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

## Round 2 — composition (user-judged, live)

The first typography pass (four font swaps on one layout: Georgia,
Charter, Fraunces, Courier Prime — `?area=type`) was rejected by the user
outright: personality doesn't come from the font menu. Round 2 offered
three full compositions over Forest Night tokens (design-lab.html):

| Direction | Outcome | Why |
| --- | --- | --- |
| **I · Quadrangle** (USGS survey sheet) | **Winner** | Neatlines, corner marginalia, condensed masthead — and the quads' convention that natural features run serif italic, which makes *the walker's words* typographically distinct from the machine's upright annotations. |
| II · Unigrid (Vignelli NPS brochure) | Lost | Disciplined and confident, but anonymous — nothing of this product's world in it. |
| III · Nightfield (memo book) | Lost | Charming cover block, but the graph-grid page texture reads as noise over daily use (now an explicit don't). |

## Round 3 — instruments (user-judged, live)

The user asked for elevation, GPS, and weather on the sheet. Three
variations (design-lab.html, final state):

| Variation | Outcome | Why |
| --- | --- | --- |
| **V1 · Station strip** | **Winner** ("i like V1") | Four ruled instrument cells (Elevation / Position / Ascent / Weather) under the masthead, cockpit-scan order; per-Capture elevation joins the station gutter; one sun line calls the next weather change. |
| V2 · Route profile | Lost | Elevation profile with status-colored station rings + forecast strip — lovely, but heavier than the trail surface needs. Candidate to revisit for the desk walk-review header. |
| V3 · Collar diagrams | Lost | Wind rose / sun arc / fix diagrams are charming but the least load-bearing. |

Weather note: the forecast requires a new product capability (forecast
cached into the Offline Region pack). `DESIGN.md` specifies the strip
collapses gracefully when a cell has no data.

## Primary source

Throwaway variants live under `/prototype/design-directions` (Next.js
rounds) and `design-lab.html` (static rounds 2–3, also published as a
Claude artifact during review) on branch
`claude/design-md-brand-system-mlwfw8` alongside the `DESIGN.md` this
prototype settled. Winner is flagged on the `/prototype` hub.
