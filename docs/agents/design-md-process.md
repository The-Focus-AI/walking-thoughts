# Prompt: Develop a DESIGN.md (Brand + Design System) for a Project — v2

Use this prompt to take a project from "we have no visual identity" (or "our
identity lives in someone's head") to a committed `DESIGN.md` that any coding
agent can read and apply consistently. The process combines the `grill-me`
skill (to extract brand decisions from the user) with the `prototype` skill
(to make those decisions concrete and comparable before writing anything
down).

v2 revises the process after a full run on `walking-thoughts` (PR #84). The
changes and their reasons are footnoted at the end.

## What a DESIGN.md is

A `DESIGN.md` is a single markdown file describing a project's visual language
in a form AI coding agents can act on. It sits between a Figma export (too
specific) and a traditional brand book (too loose). The reference
specification is [google-labs-code/design.md](https://github.com/google-labs-code/design.md):

- **YAML frontmatter** — machine-readable, normative design tokens:
  `name`, `description`, `colors`, `typography`, `rounded`, `spacing`, and
  `components`. Tokens may reference other tokens with `{path.to.token}`
  syntax (e.g. `backgroundColor: "{colors.primary}"`).
- **Markdown body** — human-readable rationale in `##` sections, in this
  order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes,
  Components, Do's and Don'ts. Prose explains *why* tokens exist and gives
  agents semantic anchors ("warm limestone neutral", "clay accent for
  irreversible actions") for decisions the tokens don't cover.
- We extend the spec with two Focus sections after Do's and Don'ts:
  **Voice & Tone** (brand personality, on-brand/off-brand copy examples) and
  **Agent Prompt Guide** (reusable snippets for prompting future UI work).

A good DESIGN.md is specific enough that two different agents produce visually
consistent UI, and flexible enough to cover situations it never mentions.
See `The-Focus-AI/focus-ai-brand` for a house example of the genre.

## Phase 0 — Posture check, then research

**Attended or unattended?** This process is an interview at its core. Before
anything else, decide which posture you are in — and do not trust
environment flags alone; a "user not watching" signal can be wrong. [^1]

- **Attended (default assumption):** run the phases below interactively.
- **Apparently unattended:** do the research, post the *first* grill
  question with your recommendation, and stop. If genuinely no response is
  possible (e.g. a one-shot CI task), you may run the full pipeline — but
  then every decision must be labeled a **veto-able recommendation**, the
  decision log leads the deliverable, and the first message when the user
  appears is the interview, not the demo. Never silently substitute repo
  evidence for the user's answers.

**Research first — facts are your job; only decisions belong to the user:**

1. Existing materials: current site/app screenshots, logos, prior decks,
   CSS/Tailwind config, prior prototype verdicts, any brand skill installed
   in the repo.
2. The audience and product surface: what does this project ship (marketing
   site, dashboard, CLI docs, PDF reports)? Which surfaces will consume the
   DESIGN.md?
3. Competitor/aspiration references if the user has named any.

**Classify each decision branch before asking about it:** [^2]

- **Evidenced** — the repo already embodies an answer (a shipped palette, a
  committed dark mode, a prior prototype verdict). Present these as
  "confirm or veto" with the evidence cited. One-word confirmations are
  fine.
- **Open** — nothing in the repo has ever taken a position (usually
  positioning nuance, personality, typography, compositional character).
  These are where the interview earns its keep — and where you must show
  artifacts before expecting useful answers.

## Phase 1 — Grill the brand (grill-me)

Run the `grill-me` skill. One question at a time, always with your
recommended answer. Prefer plain-prose questions the user can answer in free
text; structured option dialogs are optional sugar and some users will
dismiss them — treat a dismissal as "ask differently," not "stop
grilling." [^3] Confirm branch-by-branch as you go; a single big summary
gate at the end is not required.

Walk these branches in order — later branches depend on earlier ones:

1. **Positioning** — What is this product, for whom, and what should someone
   feel in the first five seconds? What one thing must the UI never evoke?
   (The "never" is often the highest-leverage answer you'll get — design
   don'ts fall straight out of it.)
2. **Personality** — Pick 3–5 personality traits. For each, ask for a brand
   or object the user thinks embodies it. Voice stays fixed; tone adapts per
   surface.
3. **Atmosphere & density** — Light or dark default? Rounded or sharp? Flat
   or elevated? Ask density *per surface*, not globally: the same product
   may need a dense working surface and a spacious reading surface. [^4]
4. **Color feelings** — Not hex values yet: warm vs cool, muted vs vivid,
   one accent or several, any colors that are off-limits (cliché,
   competitor, accessibility). Anchor to places and things from the
   product's world, not color names.
5. **Non-negotiables** — Accessibility floor (WCAG AA minimum), existing
   logo/colors that must be honored, print/PDF needs, dark-mode
   requirement, font-loading constraints (offline-first products may
   forbid CDN fonts).

**Typography is deliberately not a Phase 1 branch.** Nobody can answer
"serif or sans, geometric or humanist" usefully in the abstract, and font
choice without composition is meaningless. Typography is decided in Phase 2
with artifacts on screen. [^5]

## Phase 2 — Prototype contrasting directions (prototype)

Throwaway code answering one question per round: **"Which visual direction
is right?"** Two to three rounds is normal; each round narrows.

**Round structure:**

- **Round 1 — color & atmosphere.** 3–4 contrasting directions rendering
  identical specimen content: full type scale, color roles in use, buttons
  in all states, a form, a card, a nav, and one representative product
  screen with real-feeling copy (no lorem ipsum). Display each variant's
  would-be tokens visibly on the page — the prototype exposes its own
  state.
- **Round 2 — composition & typography.** Take the winning palette and
  build 2–3 **fully art-directed compositions** — different grids, framing
  devices, typographic systems, and detailing, each drawn from something
  real in the product's world (a document genre, an instrument, a printed
  form). A type direction is a *composition*, never a font swap: variants
  that differ only in `font-family` on an identical layout teach nothing
  and will be rejected. [^6]
- **Round 3+ — refine the winner.** Variations on one axis the user names
  (where a signature element lives, how data is composed, what the header
  carries). Later rounds may narrow the specimen content to just the
  elements the question touches. [^7]

More than three rounds means Phase 1 missed a decision — go back and grill
that branch.

**Venue — pick per round:** [^8]

- **In-repo route** (single route, `?variant=a|b|c|d`, the project's
  existing prototype conventions, one command to run): use when variants
  must be judged against real app chrome, navigation, and data shapes.
  Round 1 usually belongs here.
- **Static self-contained specimen** (one HTML file, inline CSS, fonts
  embedded as data URIs, published where the user can open it on any
  device): use for pure visual-language rounds. The iteration loop is
  minutes instead of dev-server cycles, and the user can squint at it on
  the phone the product ships on. Rounds 2+ usually belong here.

Whatever the venue: in-memory only, no persistence, no tests, no polish —
but **screenshot every variant yourself before showing the user**; you will
catch your own rendering bugs (font fallbacks, wrapped cells) that would
otherwise pollute the feedback.

Then grill again, briefly and with the artifact in front of the user: which
variant wins, what to steal from the losers, what still feels wrong. A
verdict can be three words; don't demand essays.

**Capture each round when done:** commit the round's prototype (in-repo
route and/or the static specimen file) as primary source per the repo's
prototype conventions, and record the verdict — winner, losers, why, and
steals — in a `VERDICT.md` beside it.

## Phase 3 — Distill into DESIGN.md

Write `DESIGN.md` at the project root from the winning direction:

1. Extract the exact values from the winning variant into YAML frontmatter
   tokens. Name tokens by purpose (`button-primary-hover`), not by abstract
   level (`blue-500`).
2. Write the prose sections in spec order. Every rule in the prose should
   trace to either a logged decision or something observed in a prototype
   round ("the dense table variant lost — default to airy spacing").
3. If the system has one **deepest rule** — the single distinction that
   most defines it — say so explicitly and give it teeth. Agents weight
   rules you flag as load-bearing.
4. Do's and Don'ts: capture what each losing variant got wrong as explicit
   don'ts, with the on-brand alternative beside each.
5. Voice & Tone: the 3–5 traits, voice-vs-tone rules per surface, and at
   least three on-brand/off-brand copy pairs.
6. Agent Prompt Guide: 2–3 reusable prompt snippets for generating new UI
   under this system.
7. Keep the **decision log** (in the prototype README) marked with
   provenance: which answers were user-confirmed, which remain derived
   recommendations. Anything still derived is an open veto. [^9]

## Phase 4 — Validate

- **Machine checks, kept as scripts** (they'll run again on every
  revision): every `{token}` reference resolves, no token is orphaned, and
  every text/background pair meets WCAG AA — publish the measured ratios in
  the Colors section. [^10]
- **The real test:** open a fresh agent session, give it only `DESIGN.md`,
  and ask it to build a small page the prototype never showed. **Include a
  trap**: a state where data the system celebrates is absent, or a
  destructive action, or an off-tab surface — degradation rules are where
  design systems actually fail, and a happy-path test won't touch
  them. [^11] If the result would pass the user's squint test next to the
  winning variant, ship it. If not, the file is missing a rule — add it and
  retest. Re-run this test after any major rewrite of the file, not just
  once.
- **Record discovered product work.** Prototyping frequently invents
  capabilities the product doesn't have yet (new data sources, cached
  assets, export paths). List them at the end of the effort and file
  tickets; design the tokens/components so the system degrades gracefully
  until those tickets ship. [^12]
- Commit `DESIGN.md`; archive the prototypes per the repo's conventions
  (throwaway branch where possible; the repo's standing `prototype/`
  convention otherwise). Main keeps only the validated decision and its
  primary sources.

---

### Footnotes — what changed from v1 and why

[^1]: v1 had no unattended-session guidance. The pilot run trusted a
"user is not watching" flag, ran all four phases solo, and pushed a
DESIGN.md whose positioning and density answers the user then overturned —
the file was rewritten wholesale once the interview actually happened.

[^2]: Derived answers held up wherever the repo already embodied the
decision (the shipped palette was confirmed in four words) and failed
wherever no decision had ever been made (typography, positioning nuance).
Classify first; spend interview time only where it pays.

[^3]: Structured question dialogs were dismissed twice in the pilot; every
productive exchange was plain prose ("foresty feels, like the ADK or AT")
or a screenshot answered with "i like V1."

[^4]: v1 asked "dense or airy?" globally. The real answer was "dense on the
phone (a field instrument), spacious on the desktop (a processing room)" —
per-surface density was the user's single biggest early correction.

[^5]: The pilot's first typography round — four font swaps on one fixed
layout — was rejected outright ("personality doesn't come from the font
menu"). The round that worked offered three full compositions; the winning
one decided the fonts as a side effect.

[^6]: Same lesson, stated as the rule v1 already implied for color
("contrasting means genuinely different interpretations, not one design
with different accent colors") and the pilot still violated for type.

[^7]: v1 required the full specimen inventory in every round. Narrowing
later rounds to the contested elements made variants faster to build and
easier to compare.

[^8]: v1 prescribed only the in-repo route. The user moved rounds 2–3 to a
published static specimen mid-run and the iteration loop improved
dramatically; the in-repo route still earned its keep for round 1.

[^9]: Provenance marking is what makes a partially-derived DESIGN.md honest:
the user can scan the log and see exactly which decisions still carry only
the agent's judgment.

[^10]: The pilot's ad-hoc validator and contrast scripts were rerun on every
revision; keeping them as standing artifacts is cheaper than rewriting them.

[^11]: The pilot's most valuable validation moment: a fresh agent, given a
screen with no live telemetry, correctly rendered *no* instrument strip —
because the file said cells show real data or nothing. A happy-path test
would never have exercised that rule. The same test also surfaced two real
rule gaps (destructive actions, off-tab nav state) that were folded back in.

[^12]: The pilot's weather cell invented a product capability (forecast
cached into the offline map pack). The design shipped with a graceful-absence
rule so nothing breaks until that ticket ships.
