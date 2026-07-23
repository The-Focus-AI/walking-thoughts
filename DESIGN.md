---
name: "Walking Thoughts"
description: >-
  Forest Night — the visual language of a calm field companion. Dusk-forest
  ground, warm ink, serif display, and five strictly-roled accents that keep
  sync status honest without ever sounding an alarm.
colors:
  background: "#17231b"
  background-deep: "#101712"
  surface: "#1e2c22"
  surface-raised: "#24352a"
  text: "#f2f1e8"
  text-muted: "#b9bcae"
  line: "rgba(242, 241, 232, 0.16)"
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
    fontFamily: 'Georgia, "Times New Roman", serif'
    fontWeight: 500
    letterSpacing: "-0.03em"
    lineHeight: 1.15
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontWeight: 700
    letterSpacing: "0.06em"
    textTransform: uppercase
  sizes:
    hero: "clamp(3rem, 9vw, 6.8rem)"
    title: "1.55rem"
    section: "1.15rem"
    body: "0.95rem"
    small: "0.78rem"
    micro: "0.66rem"
rounded:
  card: "16px"
  control: "12px"
  chip: "999px"
spacing:
  base: "4px"
  scale: [4, 8, 12, 16, 24, 32, 48]
components:
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
    borderColor: "{colors.line}"
    borderRadius: "{rounded.control}"
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
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    borderRadius: "{rounded.card}"
  chip:
    borderRadius: "{rounded.chip}"
    borderColor: "{colors.line}"
    color: "{colors.text-muted}"
    typography: "{typography.mono}"
  chip-ready:
    color: "{colors.identity}"
  chip-busy:
    color: "{colors.action}"
  chip-attention:
    color: "{colors.attention}"
  status-gutter:
    typography: "{typography.mono}"
    width: "6.2rem"
  enrichment-card:
    borderLeftColor: "{colors.machine}"
    borderRadius: "{rounded.control}"
  tab-bar:
    backgroundColor: "rgba(13, 19, 15, 0.96)"
    borderColor: "{colors.line}"
  focus:
    outline: "2px solid {colors.focus-ring}"
    outlineOffset: "2px"
---

# Walking Thoughts — Forest Night

## Overview

Walking Thoughts is a private field companion for one walker: commit
Captures on the trail without signal, trust they are safe, and return to
enriched Threads at the desk. The UI should feel like a calm, capable
outdoor instrument — the woods at dusk, a good notebook, a quiet trail
partner. In the first five seconds it should say: *your notes are safe
here.*

The one thing this UI must never evoke is **urgency**. No feed mechanics,
badges, streaks, unread counts, confetti, or engagement noise. Offline is
the normal state, not an error state. Waiting is calm: work in flight is
reported factually ("Syncing", "Enriching"), never dramatized with spinners
that imply something might be wrong.

Five personality traits govern every choice: **calm** (a Rite-in-the-Rain
notebook — works anywhere, never panics), **observant** (a Peterson field
guide — precise and warm), **honest** (an instrument readout — status is
always true and always visible), **unhurried** (national-park wayside
signage), and **companionable** (present, quiet, warm).

This direction ("Forest Night") won a four-way specimen prototype against a
light editorial paper direction, a cool GPS-instrument direction, and a
park-poster duotone (`app/prototype/design-directions`, verdict in that
folder). Rules below that came from a losing variant say so.

## Colors

The palette is the woods at dusk: a deep green ground, warm off-white ink,
and five accents with **strict, non-transferable jobs**. Color roles are the
grammar of the app — an agent who knows nothing else about a screen should
still color it correctly from this table.

| Token | Value | Role — and nothing else |
| --- | --- | --- |
| `background` | `#17231b` | The ground. Page background (see gradient below). |
| `background-deep` | `#101712` | Lower stop of the page gradient; scrims over the map. |
| `surface` | `#1e2c22` | Resting cards and list rows. |
| `surface-raised` | `#24352a` | Layers that sit above cards: docks, sheets, popovers. |
| `text` | `#f2f1e8` | Primary ink — warm limestone, never pure white. |
| `text-muted` | `#b9bcae` | Secondary ink: metadata, captions, supporting prose. |
| `line` | `rgba(242,241,232,0.16)` | Hairline borders and rules. |
| `action` | `#f4cf72` | **Sun** — the primary act on screen, and work in flight (Syncing / Enriching). |
| `identity` | `#a9d18f` | **Moss** — the walker: your words, Complete status, active tab, links, focus ring. |
| `attention` | `#f0b4a0` | **Clay** — stalled or stuck work that needs the walker. Matte and warm; explicitly not an alarm. |
| `machine` | `#8fb8d8` | **Sky** — the machine's voice: Enrichment cards, source chips, model metadata. |
| `record` | `#b42318` | Live capture only — the mic or camera is on *right now*. |
| `record-text` | `#fff8f0` | Text on `record`. |

Conventions:

- The canonical page backdrop is a gradient, not a flat fill:
  `radial-gradient(circle at 70% 10%, rgba(169,209,143,0.12), transparent 30%),
  linear-gradient(160deg, {colors.background} 0%, {colors.background-deep} 100%)`
  — a faint moss glow at the horizon over the dusk ground.
- Tints of an accent are made with transparency of that accent (8–14% over
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

System stacks only — the offline shell must never depend on a network font.

- **Display — Georgia serif, weight 500, tracking −0.03em.** Thread titles,
  walk dates, screen titles, Enrichment titles, the wordmark. The serif is
  the field-guide voice: use it for *names of things*, not for UI chrome.
  Display never appears in bold; its authority comes from size and the serif
  itself.
- **Body — system sans, 400/700.** All UI prose, entries, controls. Weight
  700–750 for button labels and row titles.
- **Mono — ui-monospace, 700, uppercase, tracked +0.06em at micro sizes.**
  Every machine fact: timestamps, coordinates, counts, file sizes, model
  IDs, status labels, section eyebrows. (Discipline stolen from the losing
  Instrument Panel variant — the mono gutter is the honesty pattern.)
  Model IDs and coordinates stay lowercase/as-is; only *labels* uppercase.

Scale: `hero` is reserved for the signed-out/marketing surface only. Working
surfaces top out at `title` (1.55rem) — the trail-cleanup prototype verdict
demoted the marketing hero from the authenticated home, and that decision is
permanent. Long-form Enrichment prose reads at `line-height: 1.55–1.6`
(stolen from the Field Notebook variant); UI text sits at 1.45–1.5.

## Layout

- **Mobile first, thumb first.** The app is an Android-first PWA. Primary
  navigation is a fixed bottom tab bar (Trail / Threads / Map); the Capture
  dock sticks to the bottom of the content area, in the thumb zone, above
  the tab bar. Respect `env(safe-area-inset-*)` everywhere.
- **Content columns:** working surfaces are single-column,
  `min(100%, 40rem)`; reading surfaces (Thread review) `min(100%, 46–48rem)`;
  the map-and-trail split uses `minmax(0, 1.1fr) minmax(20rem, 1fr)` at
  ≥ 900px with the map sticky.
- **Airy at rest, dense in queues.** Resting screens breathe (24–48px
  section gaps). Working lists (today's Thread, review queue) tighten to
  8–12px gaps with the status gutter carrying structure.
- **The status gutter** is the signature layout element: a `6.2rem` left
  column holding time over status label in mono microtype, with the entry
  body to the right. Every Capture row uses it; never hide status behind a
  tap.
- Spacing snaps to the 4px base scale (4/8/12/16/24/32/48). Section padding
  16px; card padding 16px; control padding 9–12px.

## Elevation & Depth

Forest Night is **flat with faint depth**, never skeuomorphic:

- Level 0 — the gradient ground.
- Level 1 — `surface` cards with a `line` hairline. No shadow.
- Level 2 — floating layers only (sticky dock, sheets, tab bar):
  `surface-raised` or a near-opaque ground tint, `backdrop-filter:
  blur(14–16px)`, and at most one soft ambient shadow
  (`0 24px 80px rgba(0,0,0,0.24)`).
- Overlays over imagery/maps use vertical scrims from transparent to
  `rgba(16,23,18,0.9)` — never darken the whole image.

If a surface needs more separation, prefer a stronger border or a tinted
fill over a bigger shadow.

## Shapes

- Soft, river-stone rounding: `card` 16px, `control` 12px, `chip` full pill.
- Hairline borders (1px `line`) on every card and control; status accents
  arrive as a 3px **left** border on rows (Capture entries, Enrichment
  cards, configuration notes).
- The brand mark is a moss pebble: an asymmetric blob
  (`border-radius: 35% 65% 55% 45%`) in `identity` with a serif "W" in
  `background`.
- No sharp corners, no bevels, no glows. Dashed borders are reserved for
  "add media" affordances and collapsed traces.

## Components

- **Primary button** — `action` fill, `action-text` ink, weight 750, min
  height 44px, radius `control`. **One per viewport**: the single primary
  act on screen (usually "Commit Capture"). Hover brightens 6%; disabled
  drops to 55% opacity and keeps its label (stolen restraint from the
  Ranger Duotone variant).
- **Secondary button** — transparent fill, `line` border, `text` ink.
  Hover strengthens the border to `text`.
- **Quiet button/link** — `identity` text, no chrome; underline on hover.
- **Record button** — `record` fill, `record-text` ink; while recording it
  pulses gently (`brightness 1 → 1.12`, 1.2s) and is the only animated
  attention-getter in the app. Honor `prefers-reduced-motion`.
- **Controls** (input, select, textarea) — near-black inset fill
  `rgba(0,0,0,0.18)`, `line` border, radius `control`, placeholder in
  `text-muted`. Focus: 2px `focus-ring` outline, 2px offset — on every
  interactive element, no exceptions.
- **Status chips** — pill, mono microtype, tinted per status: `identity`
  (Complete/ready), `action` (Syncing/Enriching), `attention`
  (Needs attention), `text-muted` (Reviewed/neutral). Tint recipe: accent at
  ~10% for fill, ~45% for border.
- **Capture entry** — status gutter left; body right; 3px left border in
  the status color; `Needs attention` rows additionally tint their fill
  with `attention` at 7–8%.
- **Enrichment card** — the machine speaks in a `machine`-tinted card: 3px
  left border, 8% fill tint, mono header (`ENRICHMENT · time · model-id`),
  serif title, markdown body, numbered source chips, research trace folded
  in a `<details>`.
- **Sync pill** — glanceable rollup in the chrome: dot + mono count
  ("2 syncing"). Dot color follows status roles; `attention` state also
  tints the pill border.
- **Tab bar** — fixed bottom, three tabs, mono microtype labels under
  icons; active tab in `identity` with a 10–12% identity tint. On desktop it
  narrows to a centered `26rem` pill dock.
- **Empty states** — confident and directive ("Download a region to render
  maps in airplane mode" + primary button), never apologetic gray boxes.
- **Destructive settings actions** (delete local data, remove media) — a
  secondary button with honest copy stating exactly what is and is not
  recoverable. Never `record` red (that means "recording now") and never
  `attention` clay (that means "stuck work"). Confirmation is a second
  explicit step, not a scary color.
- **Tab bar on non-tab surfaces** (settings, sign-in, sheets): render the
  bar with no active tab — all labels in `text-muted` — rather than
  pretending the screen belongs to a tab.

## Do's and Don'ts

- **Don't** switch a surface to light/paper because it looks editorial —
  the Field Notebook variant lost: a light default fails at dawn on the
  trail. **Do** keep every product surface on the Forest Night ground;
  paper values are reserved for future print/Markdown export.
- **Don't** drop card chrome so far that stuck work disappears into the
  page (where Field Notebook failed). **Do** give `Needs attention` rows a
  visible tinted fill and border plus a Retry affordance.
- **Don't** use cool grays, signal orange, or amber warnings — the
  Instrument Panel variant read tactical-urgent. **Do** keep attention
  states in warm clay with factual copy.
- **Don't** let two accents share a job or one accent hold two jobs (the
  Ranger Duotone failure). **Do** check the color-role table before
  introducing any colored element; if a new job appears, extend the table
  deliberately.
- **Don't** set display type in bold, all-caps, or weight 900 — signage,
  not companionship. **Do** let Georgia at weight 500 carry titles.
- **Don't** dramatize processing (indeterminate spinners, "please wait…",
  progress theater). **Do** state facts in status labels and keep the UI
  usable while work is in flight.
- **Don't** use red except while the mic or camera is live. Failed sync is
  clay `attention`, not red.
- **Don't** add webfonts, icon fonts, or CDN assets. **Do** use system
  stacks and inline SVG icons.
- **Don't** put marketing-scale type on working surfaces. **Do** reserve
  `hero` for the signed-out shell.

## Voice & Tone

Voice is fixed: a calm, observant, honest, unhurried companion. Tone
adapts by surface — **terse and glanceable on the trail** (short labels,
mono facts, nothing to read twice in sunlight), **expansive and editorial
at the desk** (full sentences, serif titles, room to think).

Rules:

- Use the canonical vocabulary, capitalized: Capture, Thread, Enrichment,
  Inbox, Reviewed, Offline Region. Never "note", "chat", "sync response",
  "archive", "cache".
- State facts, not feelings. The app never congratulates, apologizes
  theatrically, or exclaims. No emoji in product copy.
- Offline is normal: copy treats missing signal as expected weather, not
  failure.

| On-brand | Off-brand |
| --- | --- |
| "Saved locally — sync can wait for signal." | "Note saved! ✅ We'll sync it to the cloud ASAP!" |
| "Photo upload stalled. It will retry when you're back in range." | "Oops! Something went wrong 😢 Please try again!" |
| "Enriching — researching your Capture from 08:05." | "✨ AI magic is happening… hang tight!" |
| "No Offline Region yet. Download one to render maps in airplane mode." | "It's empty in here! Get started by adding your first map 🗺️" |

## Agent Prompt Guide

Reusable snippets for prompting UI work under this system.

**New surface:**

> Build this screen for Walking Thoughts using DESIGN.md. Forest Night
> ground (`background` gradient), `surface` cards with hairline `line`
> borders, radius tokens as given. Georgia 500 for titles only; mono
> uppercase microtype for timestamps/status/counts. Accent roles are
> strict: moss `identity` = walker/complete/active, sun `action` = the one
> primary act + work in flight, clay `attention` = stuck work, sky
> `machine` = Enrichment only, `record` red only while recording. One
> primary button per viewport. Every status color ships with its text
> label. Thumb-zone actions, safe-area insets, 44px touch targets, 2px
> moss focus ring, contrast ≥ 4.5:1 (aim 7:1).

**Capture/Thread list rows:**

> Render rows with the status gutter: a 6.2rem left column, mono
> microtype, time above status label (`Saved locally` / `Syncing` /
> `Enriching` / `Complete` / `Needs attention`), 3px left border in the
> status color, body text right. `Needs attention` rows add a 7% clay tint
> and a Retry secondary button. Dense list spacing (8–12px); no
> card-per-row shadows.

**Copy pass:**

> Rewrite this copy in Walking Thoughts voice: calm, factual, unhurried.
> Use Capture / Thread / Enrichment / Offline Region vocabulary. No
> exclamation points, no emoji, no apology theater, no "AI magic".
> Offline is normal. Trail surfaces: fragments under six words. Desk
> surfaces: complete quiet sentences.
