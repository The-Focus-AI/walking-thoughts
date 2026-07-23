# Design normalization sweep — plan

Bring every shipped surface in line with the Quadrangle brand system
committed in `DESIGN.md` (PR #84). This is the gap analysis and the phased
plan; each phase is sized to be one ticket/PR, ordered so the mechanical
work lands before the structural work and nothing has to be styled twice.

**The gap in one sentence:** the app already sits on the Forest Night
palette (dusk-green ground, moss/sun accents, the gradient backdrop), but
everything above the palette predates Quadrangle — no condensed display
voice, no survey-sheet composition, rounded glassy cards with shadows where
flat ruled sheets should be, a messenger-bubble Thread view, and a dozen
color-role violations.

Full per-file violation audit: see appendix at the bottom.

## Phase 0 — Foundations: tokens, fonts, focus

Everything later depends on this; no visible redesign yet.

1. **Complete the `:root` token set** in `app/globals.css`. Today it has 7
   variables; DESIGN.md defines 15. Add `--background-deep`, `--surface`
   (`#1e2c22`), `--surface-raised` (`#24352a`), `--line-strong`,
   `--attention` (`#f0b4a0`), `--machine` (`#8fb8d8`), `--record`
   (`#b42318`), `--record-text`, `--action-text`, `--focus-ring`. Retire
   `--forest-light` (`#223329` is not a brand value → `--surface`).
2. **Sweep hard-coded hexes onto tokens.** `#f0b4a0` appears inline 8×,
   `#b42318` 3×, sky is approximated as `rgba(120,170,210,…)` instead of
   `#8fb8d8`, and white-tint fills (`rgba(255,255,255,…)`) are used as
   neutrals in ~12 places — DESIGN.md forbids pure white; mix neutrals from
   the ground green (`--surface` / `--surface-raised`).
3. **Self-host Barlow Condensed.** Ship latin woff2 subsets for weights 500
   and 600 at `public/fonts/barlow-condensed-{500,600}.woff2`, add
   `@font-face` with `font-display: swap`, preload in `app/layout.tsx`, and
   add both files to the service-worker shell precache (offline-first, no
   CDN — hard rule).
4. **Define the four type voices as reusable classes** (`.t-display`,
   `.t-capture`, `.t-body`, `.t-mono`) matching the frontmatter specs, and
   fix the body stack: `Arial, Helvetica` → the spec's
   `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
5. **Global focus ring.** One rule — `2px solid var(--focus-ring)`, offset
   2px — applied via `:focus-visible` to every interactive element. Today
   only the composer select/textarea have any custom focus, and it's a
   transparent moss, not the spec ring.

## Phase 1 — Shapes & depth: the flat-ruled-printed sweep

Mechanical CSS pass over `globals.css`; low regression risk, huge visual
shift toward "printed sheet".

1. **Radius normalization.** Sheets, cards, log rows, annotation blocks,
   instrument cells → `0` with ruled borders (16 selectors currently at
   0.65–1.1rem / 14–18px). Controls (buttons, inputs, selects, textareas)
   → `4px` (currently 0.7–0.85rem). Floating chrome only (tab bar, capture
   dock, bottom sheets) → `12px`. Sync pill stays a pill.
2. **De-pill the sheet content.** Pills/chips inside sheets move to the
   spec treatments: thread status chips → station-gutter text + 7–8% tinted
   row fill; queue filter chips and search field → square 4px controls;
   enrichment source chips → numbered mono citations
   (`[1] MUSHROOMEXPERT.COM`); trace-tool pills → mono labels;
   `.journal-close`, `.thread-copy-markdown` → square secondary buttons.
3. **Kill shadows and glows inside the sheet.** `box-shadow` on
   `.capture-card`, `.journal-panel`, `.journal-locate`, `.journal-gps-dot`;
   glow rings on all status dots. Depth comes from rules: adopt
   `rule-major` (2px over 1px) for masthead/footer separations.
4. **Dashed borders** become media-only (`.capture-add-media`, media
   stubs). The research-trace `<details>` loses its dashed box.

## Phase 2 — Color roles: every accent back to its one job

1. **Enrichment is the machine → sky, not sun.** `.enrichment-report` left
   border, `✦` mark, blockquote border, and source index all render sun
   today. Move the whole Annotation treatment to `--machine`: 2px sky left
   rule, mono sky header (`ANNOTATION · 08:09 · <model-id>`), upright body.
2. **Moss is identity, not action.** Moss-filled buttons
   (`.journal-empty`, `.journal-followup`, `.region-tracer-offer/error`,
   active queue chip) become primary (sun) only where they are *the*
   primary act on the viewport, otherwise secondary outline or quiet-link
   treatment.
3. **One primary per viewport.** Trail home currently shows the sun Commit
   button, sun Retry affordances, and the map hero's sun Download at once.
   Commit Capture keeps sun; Retry becomes the square secondary
   ("RETRY SYNC"); Download demotes when the composer is present.
4. **Failure is clay, not sun.** `.region-tracer-error` border, and the
   brown `#8a4b12` export error, move to `--attention`.
5. **Off-palette outliers.** GPS dot `#2f7bd9` + pure-white ring, locate
   button `#fdf6ec` paper fill, near-white export buttons, cool-gray footer
   `#8e958b` — all re-derived from tokens (GPS position is a measured fact:
   moss dot with a ground ring reads correctly).
6. **Red audit.** Confirm `--record` renders only while mic/camera is live
   (`.availability-error` currently borrows it — move to clay).

## Phase 3 — Survey-sheet composition, surface by surface

The structural phase. Build the shared primitives once, then apply
per-surface. New shared components (in `components/` or a `components/sheet/`
folder):

- **`Sheet`** — neatline wrapper: `line-strong` border + offset `line`
  outline, corner-marginalia slots (real data only; empty corners stay
  empty).
- **`Masthead`** — mono agency eyebrow (`WALKING THOUGHTS · PROVISIONAL
  SURVEY`), place name in display at `masthead` size, date/region line in
  condensed 500. One per sheet.
- **`InstrumentStrip`** — ruled Elevation / Position / Ascent / Weather
  cells, condensed tabular values over mono micro sublabels; cells without
  data are omitted; optional sun `conditions-note` only when a cached
  forecast exists.
- **`StationGutter`** — the signature 4.9rem left column stacking time
  (display 1.5rem tabular) / elevation (mono micro) / status label (mono
  micro, role-colored). Replaces today's 6.2rem status-only
  `.capture-gutter`.
- **`ScaleBarFooter`** — alternating scale bar + mono promise line
  (`COMMITTED LOCALLY FIRST · SYNCED WHEN IN RANGE`) + day tally. Replaces
  the rounded `.trail-sync-footer` card.

Then per surface, roughly in order of daily importance:

1. **Trail home** (`app-shell.tsx` + `capture-composer.tsx` +
   `trail-map-hero.tsx`): compose as one sheet — masthead replaces the
   topbar brand row, instrument strip under it, today's log on station
   gutters with the walker's words in italic Georgia, scale-bar footer.
   Map hero loses its rounded-card chrome (scrim overlay stays).
2. **Thread review** (`thread-chat.tsx` + `enrichment-report.tsx` +
   `thread-entries.tsx`): **remove the messenger shape entirely** — no
   left/right bubbles, no "You" speaker labels. A Thread is a survey log:
   Capture entries in italic serif on station gutters; Annotations as
   sky-ruled machine entries with mono headers and numbered citations;
   the reply composer stays a plain control block at the foot. This is the
   deepest single change in the sweep.
3. **Threads queue** (`threads-archive.tsx`): ruled hairline-separated day
   sections (per the Field Notebook steal), status as gutter text + row
   tint instead of chips, day photo strips reframed as dashed media stubs
   or dropped (feed/gallery smell).
4. **Map Journal** (`map-journal.tsx`): sheet-framed panel, mono facts for
   coordinates/revisions, palette-correct GPS/locate (phase 2), bottom
   sheet keeps 12px floating-chrome treatment.
5. **Offline maps + region tracer** (`offline-maps-page.tsx`,
   `region-tracer.tsx`, `offline-region-panel.tsx`): sheet composition;
   every measured fact (pack size, first-render ms, storage estimate,
   layer sizes) to mono micro; buttons to spec roles.
6. **Signed-out shell / access denied / auth pages**: keep the hero scale
   (the one surface allowed marketing type), swap the Georgia h1 for the
   display voice, add minimal sheet framing around the Clerk cards.
7. **Chrome** (`app-nav.tsx`, `sync-status-pill.tsx`): tab labels to mono
   micro, desktop tab bar radius to 12px, drop dot glows. These already
   have the right bones.

## Phase 4 — Copy & vocabulary pass

One pass across all user-facing strings (components + `lib/disclosures/copy.ts`
+ `lib/offline-region/download-copy.ts` + `manifest.ts`), applying the Voice
& Tone rules:

- **Canonical vocabulary:** "Caching shell…" / "screens are cached" →
  shell-ready phrasing without "cache"; "Report ready" → `Complete`;
  "Researching…" → `Enriching`; `threads-archive` naming → queue/Threads
  ("archive" is forbidden); `thread-chat` naming → thread review ("chat" is
  forbidden). Class/file renames ride along with the phase-3 rebuilds of
  those surfaces.
- **No glyph theater:** drop `✦`, `✓` ("Reviewed ✓"), `✕` (use a labeled
  close); weather glyphs in the instrument strip remain (cartography, not
  emoji).
- **No congratulation:** "You're caught up — every Thread is reviewed." →
  factual ("0 Threads waiting.").
- **Status labels everywhere** color appears: `SAVED LOCALLY / SYNCING /
  ENRICHING / COMPLETE / NEEDS ATTENTION`, mono uppercase, in the gutter.

## Phase 5 — Tests, contrast, and guardrails

- **Tests updated with each phase, not at the end.** The audit identified
  ~20 spec files pinned to current copy, testids, and class names. Highest
  exposure: `thread-chat.spec.ts` (bubble testids like `chat-turn-you`),
  `threads.spec.ts` / `threads-workspace-desktop.spec.ts`,
  `disclosures.spec.ts` (`trail-sync-footer`, footer copy),
  `offline-maps.spec.ts` ("Caching shell"), `map-journal*.spec.ts`
  (`journal-gps-dot`, `journal-locate`), `navigation.spec.ts`,
  `sync.spec.ts` / `offline-capture.spec.ts` ("Saved locally", "Retry").
  Note: `auth.spec.ts` expects "Today's hike" while the UI says "Today" —
  already-stale assertions get reconciled in phase 3.
- **Contrast check** any new pair against the DESIGN.md table (≥ 4.5:1,
  prefer ≥ 7:1) — particularly sky-on-tinted-annotation and clay-on-tinted
  rows.
- **Reduced motion:** the recording pulse honors
  `prefers-reduced-motion` (today it does not check).
- **Playwright screenshot pass** per phase (mobile 390×844 + desktop),
  compared against the winning prototype specimens under
  `app/prototype/design-directions/`.

## Sequencing & ticket shape

Each phase is one ticket/PR; 0 → 1 → 2 are mechanical and safe to land
quickly, 3 splits naturally into sub-tickets per surface (3.1 trail home,
3.2 thread review, 3.3 threads queue, 3.4 map journal, 3.5 offline
surfaces, 3.6 auth shell, 3.7 chrome), 4 and 5 ride along with 3's
sub-tickets where the strings/tests live in the surface being rebuilt, with
a final catch-all pass. The `app/prototype/design-directions/` CSS
(`prototype-design.css`, `design-lab.html`) is the implementation reference
for the sheet primitives — steal measurements, not files.

---

## Appendix — audit findings by rule

Condensed from a full-file sweep (2026-07-23) against DESIGN.md. Line
numbers refer to the tree at commit `9862aaa`.

### Typography voices

- No element anywhere renders Barlow Condensed; the font is not shipped.
- Georgia serif used on non-walker headings: global `h1`
  (`globals.css:481`), `.trail-map-hero-name` (112), map-hero empty h2
  (133), `.offline-maps-header h1` (200), `.capture-section-title` (620),
  `.data-handling h2` (1130). (The Georgia "W" brand mark is
  spec-sanctioned.)
- Italic on non-walker text: enrichment blockquote (2020), `.chat-pending`
  (1650).
- Measured facts in body sans instead of mono micro: `.capture-entry-meta`
  (649), `.thread-row-meta` (795), enrichment head time (1959),
  region-tracer metrics (1543–48), `.capture-context` (1066); status
  labels sans-800: `.gutter-label` (310), `.capture-status` (658),
  `.thread-speaker` (687). Tab labels sans-800 (`.app-tab`).

### Capture words (the deepest rule)

The walker's words render plain sans nearly everywhere: `.capture-entry p`
(1093), `.thread-row-words` (1867), `.chat-bubble p` (1630). The one
Georgia instance, `.thread-capture-words` (1911), is missing `font-style:
italic`.

### Shapes / depth

- 16 rounded-card selectors at 0.65rem–18px that should be radius 0;
  controls at 0.7–0.85rem that should be 4px (details in phase 1).
- Shadows inside the sheet: `.capture-card` (508), `.journal-panel`
  (1478), `.journal-locate` (1454), `.journal-gps-dot` (1437); glow rings
  on status dots (454, 459, 1825, 1830, 1840).
- Pills inside sheet content: `.thread-chip` (814), queue chips (2273–90),
  `.threads-search` (2297), source chips (2068), `.trace-tool` (2117),
  `.thread-copy-markdown` (1887), `.journal-close` (1373), progress track
  (169).
- Dashed non-media border: `.enrichment-trace` (2083).

### Color roles

- Missing tokens; `--forest-light` off-spec; hard-coded accent hexes
  throughout (phase 0 list).
- Machine voice in sun: `.enrichment-report` (1955), `-mark` (1968–70),
  blockquote (2017), `.enrichment-source-index` (2078).
- Moss-filled action buttons: 1319, 1420, 1522, 2290.
- Off-palette: `#2f7bd9` (1436, 1452–53), `#fdf6ec` (1452), pure white
  border (1436), near-white export buttons (1166), brown error `#8a4b12`
  (1181), cool-gray footer `#8e958b` (1185), white-tint fills (507, 646,
  774, 885, 1027, 1121, 1166, 1170, 1956, 2030, 2070, 2299).
- Failure in sun instead of clay: `.region-tracer-error` (1513).
- Record red outside recording: `.availability-error` (1008).

### Social / chat shapes

`thread-chat.tsx` renders a messenger: right-aligned `chat-turn-you`
bubbles with tail radii (`globals.css:1610–1645`), left "agent" side,
literal "You" speaker labels (`thread-chat.tsx:124,172`,
`thread-entries.tsx:83`). Threads day view has a photo-strip gallery
(`threads-archive.tsx:293–303`).

### Composition

No masthead, neatline, corner marginalia, instrument strip, or scale-bar
footer exists anywhere. Station gutter is a 6.2rem status-label-only
column (`globals.css:303–317`) vs the spec 4.9rem time/elevation/status
stack. `.trail-sync-footer` (332–351) stands where the scale-bar footer
belongs.

### Voice & copy

"Caching shell…" (`offline-readiness.tsx:41`), "cached"
(`offline-maps-page.tsx:149–151`), "Report ready" / "Researching"
(`threads-archive.tsx:47,331–334`), "Researching this Capture…"
(`thread-chat.tsx:516`), "You're caught up —" (`threads-archive.tsx:270`),
"Reviewed ✓" (`thread-chat.tsx:437`), `✦` (`enrichment-report.tsx:85–87`),
`✕` (`thread-chat.tsx:485`, `map-journal.tsx:542`); "archive" and "chat"
as file/class names.

### Focus

Only the composer select/textarea have focus styles, and both use
transparent moss instead of the solid 2px `focus-ring` + 2px offset. Every
button, link, tab, pill, and the remaining inputs rely on browser
defaults.
