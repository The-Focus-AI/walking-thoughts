# PROTOTYPE — Design directions (brand + design system)

Throwaway variants answering:

> **Which visual direction should Walking Thoughts commit to in `DESIGN.md`?**

Not production. Fixture data only. Switcher hidden on the production
deployment. Effort: develop a root `DESIGN.md` (google-labs-code/design.md
shape + Focus Voice & Tone / Agent Prompt Guide extensions) that any coding
agent can apply consistently.

## Run

```bash
mise run dev
```

Open:

- `/prototype` — hub
- `/prototype/design-directions?viewport=mobile&variant=a`

| Control | Action |
| --- | --- |
| Mobile / Desktop tabs | Pixel frame (390×844) vs desktop shell (1280×900) |
| ← → (or keyboard arrows) | Cycle a → b → c → d |

Every variant renders the **same specimen content** so directions are
comparable: its own token sheet (colors, fonts, radii, spacing — the
prototype exposes its own state), full type scale, color roles in use,
buttons in all states, the Capture form, a Thread card, the tab bar, and a
representative trail screen with real-feeling copy.

## Decision log (grill phase, run against repo evidence)

This session ran unattended, so the grill interview was run against the
strongest available evidence instead of live answers. Each decision below is
the recommended answer and is open to veto; overturning one means re-running
the affected variants.

1. **Positioning** — *(user-confirmed after the fact, overriding the
   autonomous recommendation)* — One walker's **private journal**: commit
   Captures on the trail without signal, trust they are safe, return to
   enriched Threads at the desk. First five seconds should feel intimate:
   *"this is mine, and my notes are safe here."* The UI must never evoke
   **the social** — nothing that smells like a shared or public feed; and
   as a close second, never urgency (badges, streaks, engagement noise).
   *(Evidence: README.md, CONTEXT.md vocabulary and its "Avoid" lists,
   ADR 0003 local-first visible processing, single-user Clerk allowlist.)*
2. **Personality** — *(user-confirmed)* — intimate (a personal field
   notebook, addressed to one reader), calm (Rite-in-the-Rain notebook),
   observant (Peterson field guides), honest (instrument readouts — status
   is always true, never spinner theater). Voice fixed; tone goes terse and
   glanceable on trail surfaces, expansive and editorial at the desk.
3. **Atmosphere** — *(density user-confirmed, dark default uncontested)* —
   dark by default (dawn starts, battery, the shipped identity). Density
   follows the surface: **mobile is tight and information-dense** — a
   notebook page, a topo map, a flight-planning kneeboard — while
   **desktop is spacious**, the room where thoughts get processed, filed
   away, and marked Reviewed. Editorial headings over utilitarian working
   rows; soft-rounded; flat with faint elevation reserved for floating
   layers. *(Evidence: `app/globals.css`, trail-cleanup and thread-review
   VERDICTs, user direction.)*
4. **Color feelings** — *(user-confirmed: "foresty feels, like the ADK or
   AT")* — warm, muted, a Northeastern woodland at dusk. Accents
   have strict jobs: moss = you/identity/success, sun = primary action and
   work in progress, clay = needs attention, sky = the machine's voice
   (Enrichment), signal red only while recording. Off-limits: neon
   gradients, purple "AI glow", pure `#000`/`#fff`.
5. **Typography & composition** — *(user-driven across three live rounds;
   see design-lab.html)* — the user rejected font-swap variants ("looks
   like shit") and asked for real art direction. Round 2 offered three
   compositions (USGS Quadrangle, NPS Unigrid, memo-book Nightfield);
   **Quadrangle won**. Round 3 instrumented it three ways (station strip,
   route profile, collar diagrams); **V1 station strip won**, adding
   elevation, GPS, ascent, and cached-forecast weather to the sheet.
   Committed voices: Barlow Condensed 600 caps display (self-hosted
   woff2), **Georgia italic reserved for the walker's words** (the USGS
   natural-features convention), system sans body, mono for measured
   facts. The old system-stacks-only rule relaxed to
   self-hosted-webfonts-allowed.
6. **Non-negotiables** — *(user-confirmed)* — WCAG AA for every text/background pair; color never
   the only status signal (labels always); bottom tab bar + capture dock in
   the thumb zone with safe-area insets; reduced-motion respected; canonical
   domain vocabulary (Capture, Thread, Enrichment, Reviewed, Offline
   Region) in all UI copy.

## Variants

| Key | Name | Idea (what it contests) |
| --- | --- | --- |
| a | Forest Night | The shipped identity, systematized: dusk-forest ground, moss/sun/clay/sky role accents, serif display, soft glassy cards. The incumbent. |
| b | Field Notebook | Contests **dark-by-default**: warm paper, printed-field-guide editorial — ruled lists, serif everywhere, flat hairlines, ink-opacity hierarchy. |
| c | Instrument Panel | Contests **warmth and softness**: cool near-black GPS-unit utility — mono microtype, hard borders, sharp corners, signal orange + GPS cyan, dense. |
| d | Ranger Duotone | Contests **quiet multi-accent subtlety**: national-park-poster duotone — cream + deep pine blocks, heavy display type, chunky borders, one gold accent. |

## Verdict

See [VERDICT.md](VERDICT.md) after judging.
