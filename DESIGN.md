---
name: "Walking Thoughts"
description: >-
  Quadrangle — a private trail journal set like a USGS survey sheet.
  Dusk-forest ground, condensed survey mastheads, the walker's words in
  serif italic, and five strictly-roled accents that keep sync status
  honest without ever sounding an alarm.
colors:
  background: "#17231b"
  background-deep: "#101712"
  surface: "#1e2c22"
  surface-raised: "#24352a"
  text: "#f2f1e8"
  text-muted: "#b9bcae"
  line: "rgba(242, 241, 232, 0.16)"
  line-strong: "rgba(242, 241, 232, 0.38)"
  action: "#f4cf72"
  action-text: "{colors.background}"
  identity: "#a9d18f"
  attention: "#f0b4a0"
  machine: "#8fb8d8"
  record: "#b42318"
  record-text: "#fff8f0"
  focus-ring: "{colors.identity}"
typography:
  display:
    fontFamily: '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif'
    fontWeight: 600
    letterSpacing: "0.03em"
    textTransform: uppercase
    lineHeight: 0.95
  capture:
    fontFamily: 'Georgia, "Times New Roman", serif'
    fontStyle: italic
    fontWeight: 400
    lineHeight: 1.45
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontWeight: 700
    letterSpacing: "0.08em"
    textTransform: uppercase
  sizes:
    masthead: "clamp(2rem, 7vw, 2.9rem)"
    station-time: "1.5rem"
    title: "1.5rem"
    section: "1.15rem"
    capture: "1.06rem"
    body: "0.95rem"
    small: "0.78rem"
    micro: "0.62rem"
rounded:
  sheet: "0px"
  control: "4px"
  floating: "12px"
  chip: "999px"
spacing:
  base: "4px"
  scale: [4, 8, 12, 16, 24, 32, 48]
components:
  sheet:
    backgroundColor: "{colors.background}"
    borderColor: "{colors.line-strong}"
    borderRadius: "{rounded.sheet}"
    outline: "1px solid {colors.line}"
    outlineOffset: "4px"
  masthead:
    typography: "{typography.display}"
    fontSize: "{typography.sizes.masthead}"
    textAlign: center
  masthead-agency:
    typography: "{typography.mono}"
    letterSpacing: "0.32em"
    color: "{colors.text-muted}"
  corner-marginalia:
    typography: "{typography.mono}"
    fontSize: "{typography.sizes.micro}"
    color: "{colors.text-muted}"
  instrument-strip:
    borderTop: "2px solid {colors.line-strong}"
    borderBottom: "1px solid {colors.line}"
    columns: "elevation | position | ascent | weather"
  instrument-value:
    typography: "{typography.display}"
    fontVariantNumeric: tabular-nums
  conditions-note:
    typography: "{typography.mono}"
    color: "{colors.action}"
  station-gutter:
    width: "4.9rem"
    rows: "time | elevation | status"
  station-time:
    typography: "{typography.display}"
    fontSize: "{typography.sizes.station-time}"
    fontVariantNumeric: tabular-nums
  capture-words:
    typography: "{typography.capture}"
    fontSize: "{typography.sizes.capture}"
    color: "{colors.text}"
  annotation:
    borderLeft: "2px solid {colors.machine}"
    headTypography: "{typography.mono}"
    headColor: "{colors.machine}"
  button-primary:
    backgroundColor: "{colors.action}"
    color: "{colors.action-text}"
    borderRadius: "{rounded.control}"
    fontWeight: 750
    minHeight: "44px"
  button-primary-hover:
    filter: "brightness(1.06)"
  button-secondary:
    backgroundColor: "transparent"
    color: "{colors.text}"
    borderColor: "{colors.line-strong}"
    borderRadius: "{rounded.control}"
    typography: "{typography.display}"
    fontSize: "0.8rem"
    letterSpacing: "0.1em"
    minHeight: "44px"
  button-quiet:
    backgroundColor: "transparent"
    color: "{colors.identity}"
    fontWeight: 750
  button-record:
    backgroundColor: "{colors.record}"
    color: "{colors.record-text}"
    borderRadius: "{rounded.control}"
  button-disabled:
    opacity: 0.55
  control:
    backgroundColor: "rgba(0, 0, 0, 0.18)"
    color: "{colors.text}"
    borderColor: "{colors.line}"
    borderRadius: "{rounded.control}"
    minHeight: "44px"
  rule-major:
    borderTop: "2px solid {colors.line-strong}"
    borderBottom: "1px solid {colors.line}"
  scale-bar:
    height: "6px"
    borderColor: "{colors.line-strong}"
    fill: "{colors.line-strong}"
  sync-pill:
    borderRadius: "{rounded.chip}"
    borderColor: "{colors.line}"
    typography: "{typography.mono}"
  tab-bar:
    backgroundColor: "rgba(13, 19, 15, 0.96)"
    borderColor: "{colors.line}"
    borderRadius: "{rounded.floating}"
  focus:
    outline: "2px solid {colors.focus-ring}"
    outlineOffset: "2px"
---

# Walking Thoughts — Quadrangle

## Overview

Walking Thoughts is one walker's **private journal**: commit Captures on
the trail without signal, trust they are safe, and return to enriched
Threads at the desk. In the first five seconds it should feel intimate —
*this is mine, and my notes are safe here* — the woods at dusk, a good
notebook, no one else in the room.

The visual language is **Quadrangle**: every working surface is composed
like a USGS survey sheet. Neatline rules frame the page, marginalia sits
in the corners, a condensed masthead names the day, an instrument strip
reports elevation, position, ascent, and weather, and the day's Captures
read as a survey log. The system's signature typographic move is borrowed
straight from the quads, which set natural features in serif italic:
**the walker's words are the natural feature**, so Captures run italic
serif while the machine annotates upright.

The one thing this UI must never evoke is **the social**. Nothing may
smell like a shared or public feed: no avatars-in-a-row, no share sheets
as primary actions, no follower/like/comment shapes, no "activity"
framing, no presence indicators. A close second: never **urgency** — no
badges, streaks, unread counts, confetti, or engagement noise. Offline is
the normal state, not an error state. Waiting is calm: work in flight is
reported factually ("Syncing", "Enriching"), never dramatized.

Four personality traits govern every choice: **intimate** (a personal
field notebook — private warmth, addressed to one reader), **calm** (a
Rite-in-the-Rain notebook — works anywhere, never panics), **observant**
(a Peterson field guide — precise and warm), and **honest** (an
instrument readout — status is always true and always visible).

This language was settled across three prototype rounds
(`app/prototype/design-directions`, plus the archived design-lab
specimen): Forest Night beat three color/atmosphere directions;
Quadrangle beat a Vignelli-Unigrid brochure and a memo-book composition;
and the **station strip** (V1) beat a route-profile chart and USGS collar
diagrams for where the instruments live. Rules below that came from a
losing variant say so.

## Colors

The palette is a Northeastern woodland at dusk — the Adirondacks, the
Appalachian Trail under a hardwood canopy: a deep green ground, warm
off-white ink, and five accents with **strict, non-transferable jobs**.
Think of the accents like ADK trail-marker discs nailed to trees: each
color is a specific trail, and following the wrong one gets you lost.
Color roles are the grammar of the app — an agent who knows nothing else
about a screen should still color it correctly from this table.

| Token | Value | Role — and nothing else |
| --- | --- | --- |
| `background` | `#17231b` | The ground. Sheet and page background (see gradient below). |
| `background-deep` | `#101712` | Lower stop of the page gradient; scrims over the map. |
| `surface` | `#1e2c22` | Resting fills where a panel needs separation from the sheet. |
| `surface-raised` | `#24352a` | Floating layers: docks, sheets, popovers. |
| `text` | `#f2f1e8` | Primary ink — warm limestone, never pure white. |
| `text-muted` | `#b9bcae` | Secondary ink: metadata, captions, marginalia. |
| `line` | `rgba(242,241,232,0.16)` | Minor rules and hairline borders. |
| `line-strong` | `rgba(242,241,232,0.38)` | Neatlines, major rules, secondary-button borders. |
| `action` | `#f4cf72` | **Sun** — the primary act on screen, work in flight (Syncing / Enriching), and the conditions warning line. |
| `identity` | `#a9d18f` | **Moss** — the walker: Complete status, active tab, links, focus ring. |
| `attention` | `#f0b4a0` | **Clay** — stalled or stuck work that needs the walker. Matte and warm; explicitly not an alarm. |
| `machine` | `#8fb8d8` | **Sky** — the machine's voice: Annotations, source citations, model metadata. |
| `record` | `#b42318` | Live capture only — the mic or camera is on *right now*. |
| `record-text` | `#fff8f0` | Text on `record`. |

Conventions:

- The canonical page backdrop is a gradient, not a flat fill:
  `radial-gradient(circle at 70% 10%, rgba(169,209,143,0.12), transparent 30%),
  linear-gradient(160deg, {colors.background} 0%, {colors.background-deep} 100%)`
  — a faint moss glow at the horizon over the dusk ground.
- Tints of an accent are made with transparency of that accent (7–14% over
  the ground for fills, 35–50% for borders), never with new hex values.
- Color is never the only signal. Every status color is accompanied by its
  label (`Saved locally`, `Syncing`, `Enriching`, `Complete`,
  `Needs attention`).
- Off-limits: pure `#000`/`#fff`, neon gradients, purple "AI glow", cool
  grays. If a neutral is needed, mix from the ground green.

Measured contrast (WCAG 2.1), all AA-or-better for normal text:

| Pair | Ratio |
| --- | --- |
| `text` on `background` / `surface` / `surface-raised` | 14.3 / 12.9 / 11.5 |
| `text-muted` on `background` / `surface` / `surface-raised` | 8.4 / 7.6 / 6.7 |
| `identity` on `background` / `surface` | 9.4 / 8.5 |
| `attention` on `background` / attention-tinted surface | 9.1 / 7.1 |
| `machine` on `background` / machine-tinted card | 7.8 / 6.7 |
| `action` on `background` | 10.8 |
| `action-text` on `action` | 10.8 |
| `record-text` on `record` | 6.2 |

Keep any new pair at ≥ 4.5:1; prefer ≥ 7:1 (sunlight readability on trail).

## Typography

Four voices, each with one job. The mix is the brand — swapping any voice
into another's job breaks the sheet.

- **Display — Barlow Condensed 600, uppercase, +0.03em, tight leading.**
  Mastheads, screen titles, station times, section heads, secondary-button
  labels. This is the survey sheet's official lettering. Weight 500 for
  subheads. *Self-hosted webfont*: ship latin woff2 subsets
  (~44 KB for both weights) in the offline shell — e.g.
  `public/fonts/barlow-condensed-{500,600}.woff2` with `font-display:
  swap` and a preload; never load fonts from a CDN. `"Arial Narrow",
  system-ui` is the offline-safe fallback stack.
- **Capture — Georgia italic.** The walker's words, and nothing else. On
  USGS quads, natural features run serif italic; in this app the walker
  is the natural feature. Never italicize UI copy, machine text, or
  metadata — italic serif *means* "you said this."
- **Body — system sans, 400/700.** UI prose, controls, Annotation bodies.
  The machine speaks upright.
- **Mono — ui-monospace 700, uppercase, +0.08em at micro sizes.** Every
  measured fact: timestamps, elevations, coordinates, counts, file sizes,
  model IDs, status labels, corner marginalia. Values keep their natural
  case (`gateway/claude-fable-5`); only labels uppercase. Tabular
  numerals wherever digits align.

Scale: `masthead` appears once per sheet. Working surfaces otherwise top
out at `title` — the marketing-scale hero exists only on the signed-out
shell. Long-form Annotation prose reads at line-height 1.55–1.6 (stolen
from the losing Field Notebook variant); UI text sits at 1.45–1.5.

## Layout

- **The sheet is the surface.** Each screen composes as one survey sheet:
  corner marginalia, centered masthead (`WALKING THOUGHTS · PROVISIONAL
  SURVEY` eyebrow in letterspaced mono, place name in display, date line
  in condensed 500), instrument strip, log, footer. Chrome that floats
  (tab bar, sync pill, capture dock) sits outside the sheet.
- **Mobile first, thumb first.** Android-first PWA: fixed bottom tab bar
  (Capture / Threads / Map / You), Capture dock sticky above it in the thumb
  zone. Respect `env(safe-area-inset-*)` everywhere.
- **Dense on mobile, spacious on desktop.** The phone is the field
  instrument — notebook, topo map, kneeboard: tight 8–12px gaps, the
  station gutter carrying structure, no decorative padding. The desktop
  is the processing room — where thoughts get worked through, filed, and
  marked Reviewed: 24–48px section gaps, wide reading measures, one
  Thread in focus at a time. Density follows the job, not the component.
- **The station gutter** is the signature layout element: a `4.9rem` left
  column stacking station time (display, tabular), elevation (mono
  micro), and status label (mono micro), with the entry body right.
  Every Capture row uses it; never hide status behind a tap.
- **The instrument strip** sits under the masthead on trail surfaces:
  four ruled cells — Elevation, Position, Ascent, Weather — big condensed
  tabular values over mono micro sublabels, read left to right like a
  cockpit scan. Cells with no data are omitted, not left empty; the strip
  collapses gracefully to whatever is measured. Weather requires a
  forecast cached into the Offline Region pack — when present, one
  `conditions-note` line in sun calls the next change ("☂ RAIN LIKELY BY
  13:00"); when absent, nothing apologizes.
- Content columns: working surfaces `min(100%, 40rem)`; desk reading
  surfaces `min(100%, 46–48rem)`. Spacing snaps to the 4px scale.

## Elevation & Depth

Quadrangle is **flat, ruled, and printed** — depth comes from rules, not
shadows:

- Level 0 — the gradient ground.
- Level 1 — the sheet: `background` fill inside a `line-strong` neatline
  with a second `line` outline offset 4px. Panels inside the sheet
  separate with rules (`rule-major`: 2px over 1px) or `surface` fills. No
  shadows.
- Level 2 — floating chrome only (capture dock, tab bar, sheets):
  `surface-raised` or near-opaque ground tint, `backdrop-filter:
  blur(14–16px)`, at most one soft ambient shadow.
- Overlays over imagery/maps use vertical scrims to
  `rgba(16,23,18,0.9)` — never darken the whole image.

## Shapes

- **The sheet is square.** Sheets, log rows, annotations, instrument
  cells: radius 0 with ruled borders. Controls (buttons, inputs) soften
  to 4px so touch targets don't read as paper cuts. Floating chrome
  (dock, tab bar) rounds to 12px, and the sync pill stays a full pill —
  instruments are printed, chrome is handled.
- Status arrives as color on the station gutter's text plus, where a row
  needs weight, a tinted fill (`attention` at 7–8%) — not as chips inside
  the sheet. Pills and chips live only in floating chrome.
- Hairline rules everywhere; `rule-major` (2px + 1px pair) separates the
  masthead and footer. Dashed borders are reserved for media stubs and
  "add media" affordances.
- The brand mark is a moss pebble: an asymmetric blob
  (`border-radius: 35% 65% 55% 45%`) in `identity` with a serif "W" in
  `background`.
- No bevels, no glows, no skeuomorphic paper texture — the losing
  memo-book direction's graph-grid background was rejected as noise.

## Components

- **Masthead** — centered: letterspaced mono agency line ("WALKING
  THOUGHTS · PROVISIONAL SURVEY"), place name in display at `masthead`
  size, date/region line in condensed 500. One per sheet.
- **Corner marginalia** — mono micro facts pinned to the sheet's corners:
  coordinates top, sunrise/sunset or elevation/ascent bottom. Real
  measurements only; a corner with no data stays empty.
- **Instrument strip** — see Layout. Values in `instrument-value`
  (condensed 600, tabular), labels and sublines in mono micro. The
  weather cell's value renders in `action`; the optional
  `conditions-note` line below the strip is the only sun-colored text
  that isn't an act or in-flight status. Weather is resolved for the
  walker's position (live forecast when online, retained briefly for
  offline gaps); a future Offline Region pack may carry a longer cache.
  Cells without data are omitted — never empty placeholders.
- **Station gutter** — time / elevation / status stack. Status color
  follows the role table: moss Complete, sun Syncing/Enriching (time
  colors with it), muted Saved locally, clay Needs attention.
- **Capture words** — italic Georgia at 1.06rem. Media attachments as
  dashed mono stubs (`PHOTO · IMG_0412 · 2.1 MB`).
- **Annotation** (Enrichment) — the machine's entry: 2px sky left rule,
  mono sky header (`ANNOTATION · 08:09 · gateway/claude-fable-5`),
  condensed uppercase title, upright body at reading leading, numbered
  mono source citations (`[1] MUSHROOMEXPERT.COM`). Research trace folds
  into a `<details>`.
- **Primary button** — `action` fill, `action-text` ink, weight 750, min
  44px, radius 4px. **One per viewport** (usually "Commit Capture").
  Hover brightens 6%; disabled drops to 55% opacity and keeps its label.
- **Secondary button** — square outline in `line-strong`, condensed 600
  uppercase label ("RETRY SYNC"). Hover strengthens the border to `text`.
- **Quiet button/link** — `identity` text, no chrome; underline on hover.
- **Record button** — `record` fill; while recording it pulses gently
  (`brightness 1 → 1.12`, 1.2s) and is the only animated
  attention-getter. Honor `prefers-reduced-motion`.
- **Controls** — near-black inset fill `rgba(0,0,0,0.18)`, `line` border,
  radius 4px, placeholder in `text-muted`. Focus: 2px `focus-ring`
  outline, 2px offset — on every interactive element, no exceptions.
- **Scale-bar footer** — the sheet closes with the alternating scale bar,
  a mono promise line ("COMMITTED LOCALLY FIRST · SYNCED WHEN IN RANGE"),
  and the day's tally ("5 CAPTURES · 2 IN FLIGHT · 1 NEEDS ATTENTION").
- **Sync pill / tab bar** — floating chrome keeps the soft language:
  pill with status dot + mono count; fixed bottom tab bar with mono
  micro labels, active tab in `identity` over a 10–12% identity tint. On
  non-tab surfaces (settings, sign-in) no tab is active.
- **Destructive settings actions** — secondary treatment with honest copy
  stating exactly what is and is not recoverable. Never `record` red
  (that means "recording now"), never `attention` clay (that means
  "stuck work"). Confirmation is a second explicit step, not a scary
  color.
- **Empty states** — confident and directive ("Download a region to
  render maps in airplane mode" + primary button), never apologetic gray
  boxes.

## Do's and Don'ts

- **Don't** let italic serif appear anywhere except the walker's own
  words — not in headings, not in machine text, not for emphasis.
  **Do** keep the you-italic / machine-upright distinction absolute; it
  is the system's deepest rule.
- **Don't** print decorative data. Every corner coordinate, elevation,
  and instrument cell shows a real measurement or doesn't render.
  **Do** collapse the instrument strip to the cells that have data.
- **Don't** switch a surface to light/paper because it looks editorial —
  the light direction lost: it fails at dawn on the trail. **Do** keep
  every product surface on the Forest Night ground; paper values are
  reserved for future print/Markdown export.
- **Don't** use cool grays, signal orange, or amber warnings — the
  instrument-panel direction read tactical-urgent. **Do** keep attention
  states in warm clay with factual copy.
- **Don't** let two accents share a job or one accent hold two jobs.
  **Do** check the color-role table before introducing any colored
  element; if a new job appears, extend the table deliberately.
- **Don't** dramatize processing (indeterminate spinners, "please
  wait…"). **Do** state facts in status labels and keep the UI usable
  while work is in flight.
- **Don't** use red except while the mic or camera is live. Failed sync
  is clay `attention`, not red.
- **Don't** load fonts, icons, or any asset from a CDN. **Do** self-host
  the two Barlow Condensed weights in the offline shell; everything else
  is system stacks and inline SVG.
- **Don't** put marketing-scale type on working surfaces. **Do** reserve
  hero sizes for the signed-out shell.
- **Don't** borrow social shapes — avatar stacks, like/comment/follow
  affordances, share buttons in primary positions, "activity" feeds.
  **Do** keep the journal private-by-shape: the only voices are the
  walker (italic) and the machine (sky), and export is a deliberate desk
  action, not a share.
- **Don't** add paper textures or grid backgrounds (rejected with the
  memo-book direction). **Do** let rules and type carry the printed
  feeling.

## Voice & Tone

Voice is fixed: intimate, calm, observant, honest — a private journal
speaking to its one reader, never to an audience. Tone adapts by surface —
**terse and glanceable on the trail** (short labels, mono facts, nothing
to read twice in sunlight), **expansive and editorial at the desk** (full
sentences, room to think).

Rules:

- Use the canonical vocabulary, capitalized: Capture, Thread, Enrichment,
  Inbox, Reviewed, Offline Region. Never "note", "chat", "sync response",
  "archive", "cache".
- State facts, not feelings. The app never congratulates, apologizes
  theatrically, or exclaims. No emoji in product copy (weather glyphs
  ○ ◔ ● ☂ in the instrument strip are cartography, not emoji).
- Offline is normal: copy treats missing signal as expected weather, not
  failure.
- Speak to one reader. "Your Captures", "your Thread" — never "users",
  never audience framing ("share your walk!"), never community language.
- Survey-sheet fixtures ("Provisional Survey", "Sheet 1 of 1", the scale
  bar) are welcome dry wit — factual in form, warm in effect. Never let
  the conceit produce fake data.

| On-brand | Off-brand |
| --- | --- |
| "Saved locally — sync can wait for signal." | "Note saved! ✅ We'll sync it to the cloud ASAP!" |
| "Photo upload stalled. It will retry when you're back in range." | "Oops! Something went wrong 😢 Please try again!" |
| "Enriching — researching your Capture from 08:05." | "✨ AI magic is happening… hang tight!" |
| "No Offline Region yet. Download one to render maps in airplane mode." | "It's empty in here! Get started by adding your first map 🗺️" |
| "Export your history — every Capture, Thread, and Enrichment, yours to keep." | "Share your walk with friends and followers!" |
| "☂ Rain likely by 13:00 — clouds building from the west." | "Weather alert!! ⚠️ Don't forget your umbrella!" |

## Agent Prompt Guide

Reusable snippets for prompting UI work under this system.

**New surface:**

> Build this screen for Walking Thoughts using DESIGN.md. Compose it as a
> Quadrangle survey sheet on the Forest Night ground: neatline border
> with offset outline, mono corner marginalia (real data only), centered
> condensed-uppercase masthead, ruled sections. Four type voices with
> fixed jobs: Barlow Condensed 600 caps for display, Georgia italic ONLY
> for the walker's words, system sans for UI/machine prose, mono
> uppercase micro for measured facts with tabular numerals. Accent roles
> are strict: moss = walker/complete/active, sun = the one primary act +
> work in flight + conditions note, clay = stuck work, sky = the
> machine's voice, record red only while recording. Dense on mobile
> (kneeboard), spacious on desktop (processing room). Every status color
> ships with its text label. 44px targets, safe-area insets, 2px moss
> focus ring, contrast ≥ 4.5:1 (aim 7:1). No shadows inside the sheet —
> rules carry depth.

**Capture log rows:**

> Render Capture rows with the station gutter: 4.9rem left column
> stacking time (Barlow Condensed 600, 1.5rem, tabular), elevation (mono
> micro, e.g. "1,395 FT"), and status label (mono micro — SAVED LOCALLY /
> SYNCING / ENRICHING / COMPLETE / NEEDS ATTENTION). The walker's words
> in italic Georgia 1.06rem; attachments as dashed mono stubs. Rows
> separate with hairlines. Needs-attention rows tint clay at 7% and add a
> square-outline RETRY SYNC secondary button. Enrichments render as
> Annotations: sky left rule, mono sky header with model ID, condensed
> title, upright body, numbered sources.
>
> Instrument strip when the surface is live-trail: ruled four-cell bar
> (Elevation / Position / Ascent / Weather), condensed tabular values
> over mono sublabels; omit empty cells; sun conditions-note line only
> when a cached forecast exists.

**Copy pass:**

> Rewrite this copy in Walking Thoughts voice: intimate, calm, observant,
> honest — a private journal speaking to its one reader. Use Capture /
> Thread / Enrichment / Offline Region vocabulary. No exclamation points,
> no emoji, no apology theater, no "AI magic", no audience or sharing
> language. Offline is normal. Trail surfaces: fragments under six words.
> Desk surfaces: complete quiet sentences. Survey-sheet dryness welcome
> ("Provisional Survey", "synced when in range"); never fake data.
