/**
 * The Quadrangle design system as an Artifact can carry it: a self-contained
 * stylesheet, no CDN, no script.
 *
 * The token values below are the ones in DESIGN.md's front matter — that
 * document is the source of truth, and `tests/artifact.spec.ts` parses it to
 * hold this file to it. Change DESIGN.md first, then follow it here.
 */

/** DESIGN.md front-matter colors. Roles are strict; see its color table. */
export const QUADRANGLE_COLORS = {
  background: "#17231b",
  "background-deep": "#101712",
  surface: "#1e2c22",
  "surface-raised": "#24352a",
  text: "#f2f1e8",
  "text-muted": "#b9bcae",
  line: "rgba(242, 241, 232, 0.16)",
  "line-strong": "rgba(242, 241, 232, 0.38)",
  action: "#f4cf72",
  identity: "#a9d18f",
  attention: "#f0b4a0",
  machine: "#8fb8d8",
} as const;

/** DESIGN.md's four voices, each with exactly one job. */
export const QUADRANGLE_FONTS = {
  display: '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif',
  capture: 'Georgia, "Times New Roman", serif',
  body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

/**
 * The class vocabulary an Artifact body may use. The publish instruction
 * hands this list to the model, the stylesheet below defines every entry,
 * and the sanitizer keeps anything else from mattering. Kept in one place so
 * the three never drift apart.
 */
export const ARTIFACT_BODY_CLASSES = [
  "artifact-lede",
  "artifact-section",
  "artifact-key",
  "artifact-note",
  "artifact-open",
  "capture-words",
  "instrument-strip",
  "instrument-cell",
  "instrument-value",
  "instrument-label",
] as const;

/**
 * Level 1 of DESIGN.md's elevation model: the sheet is a `background` fill
 * inside a `line-strong` neatline with a second `line` outline offset 4px.
 * Depth comes from rules — there are no shadows inside the sheet.
 */
export const ARTIFACT_STYLESHEET = `
:root {
  --background: ${QUADRANGLE_COLORS.background};
  --background-deep: ${QUADRANGLE_COLORS["background-deep"]};
  --surface: ${QUADRANGLE_COLORS.surface};
  --surface-raised: ${QUADRANGLE_COLORS["surface-raised"]};
  --ink: ${QUADRANGLE_COLORS.text};
  --muted: ${QUADRANGLE_COLORS["text-muted"]};
  --line: ${QUADRANGLE_COLORS.line};
  --line-strong: ${QUADRANGLE_COLORS["line-strong"]};
  --action: ${QUADRANGLE_COLORS.action};
  --identity: ${QUADRANGLE_COLORS.identity};
  --attention: ${QUADRANGLE_COLORS.attention};
  --machine: ${QUADRANGLE_COLORS.machine};
  --font-display: ${QUADRANGLE_FONTS.display};
  --font-capture: ${QUADRANGLE_FONTS.capture};
  --font-body: ${QUADRANGLE_FONTS.body};
  --font-mono: ${QUADRANGLE_FONTS.mono};
}

/* Self-hosted, same-origin. DESIGN.md forbids loading any asset from a CDN. */
@font-face {
  font-family: "Barlow Condensed";
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/barlow-condensed-500.woff2") format("woff2");
}
@font-face {
  font-family: "Barlow Condensed";
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/barlow-condensed-600.woff2") format("woff2");
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: 1.25rem 1rem 3rem;
  min-height: 100vh;
  background:
    radial-gradient(circle at 70% 10%, rgba(169, 209, 143, 0.12), transparent 30%),
    linear-gradient(160deg, var(--background) 0%, var(--background-deep) 100%);
  background-attachment: fixed;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 0.98rem;
  line-height: 1.5;
}

/* Level 1: the sheet. Desk reading measure (DESIGN.md Layout). */
.sheet {
  margin: 0 auto;
  max-width: min(100%, 46rem);
  padding: clamp(1rem, 4vw, 2rem);
  background: var(--background);
  border: 1px solid var(--line-strong);
  outline: 1px solid var(--line);
  outline-offset: 4px;
}

.sheet-marginalia {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.25rem;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.sheet-masthead {
  margin: 1.5rem 0 1.25rem;
  text-align: center;
}

.masthead-agency {
  margin: 0 0 0.6rem;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.62rem;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--muted);
}

.masthead-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: clamp(2rem, 7vw, 2.9rem);
  letter-spacing: 0.03em;
  line-height: 0.95;
  text-transform: uppercase;
  color: var(--ink);
}

.masthead-line {
  margin: 0.6rem 0 0;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 1.05rem;
  letter-spacing: 0.03em;
  color: var(--muted);
}

/* rule-major: 2px over 1px, the pair that separates masthead and footer. */
.rule-major {
  height: 0;
  margin: 1.25rem 0;
  border: 0;
  border-top: 2px solid var(--line-strong);
  border-bottom: 1px solid var(--line);
  padding-bottom: 3px;
}

.sheet-body {
  font-size: 1rem;
  line-height: 1.58;
}

.sheet-body > :first-child { margin-top: 0; }

.sheet-body p { margin: 0 0 1rem; }

.sheet-body h2 {
  margin: 2rem 0 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--line);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.15rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  line-height: 1.05;
  color: var(--ink);
}

.sheet-body h3 {
  margin: 1.5rem 0 0.5rem;
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 1rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--muted);
}

.sheet-body ul,
.sheet-body ol { margin: 0 0 1rem; padding-left: 1.35rem; }

.sheet-body li { margin: 0 0 0.4rem; }

.sheet-body strong { font-weight: 700; color: var(--ink); }

/*
 * Italic serif means "you said this" and nothing else — the system's deepest
 * rule. A model reaching for <em> in machine prose gets weight, not slant.
 */
.sheet-body em { font-style: normal; font-weight: 700; }

.sheet-body code {
  font-family: var(--font-mono);
  font-size: 0.86em;
  color: var(--machine);
}

.sheet-body pre {
  margin: 0 0 1rem;
  padding: 0.85rem 1rem;
  overflow-x: auto;
  background: var(--surface);
  border: 1px solid var(--line);
}

.sheet-body pre code { color: var(--ink); }

.sheet-body a { color: var(--identity); text-underline-offset: 2px; }

/*
 * A quotation that is not the walker's own words — from a source, or from a
 * report being laid out verbatim. Ruled and upright: the italic serif next
 * door belongs to the walker alone.
 */
.sheet-body blockquote:not(.capture-words) {
  margin: 0 0 1rem;
  padding: 0.15rem 0 0.15rem 0.9rem;
  border-left: 1px solid var(--line-strong);
  color: var(--muted);
}

.sheet-body table {
  width: 100%;
  margin: 0 0 1rem;
  border-collapse: collapse;
  font-size: 0.92rem;
}

.sheet-body th,
.sheet-body td {
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

.sheet-body th {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.sheet-body hr {
  height: 0;
  margin: 1.5rem 0;
  border: 0;
  border-top: 1px solid var(--line);
}

/* The opening paragraph carries the report; give it a little more air. */
.artifact-lede {
  font-size: 1.1rem;
  line-height: 1.55;
  color: var(--ink);
}

.artifact-section { display: block; }

/* Measured facts, in the mono voice, with tabular numerals. */
.artifact-key {
  display: grid;
  grid-template-columns: minmax(6rem, 12rem) 1fr;
  gap: 0.35rem 1rem;
  margin: 0 0 1.25rem;
  padding: 0.85rem 1rem;
  background: var(--surface);
  border-left: 1px solid var(--line-strong);
}

.artifact-key dt {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  align-self: baseline;
}

.artifact-key dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

/* Sky is the machine's voice: an aside about its own reading of the Thread. */
.artifact-note {
  margin: 0 0 1.25rem;
  padding: 0.15rem 0 0.15rem 0.9rem;
  border-left: 2px solid var(--machine);
  color: var(--muted);
}

/* Clay is work that still needs the walker — never an alarm. */
.artifact-open {
  margin: 0 0 1.25rem;
  padding: 0.85rem 1rem;
  background: rgba(240, 180, 160, 0.08);
  border: 1px solid rgba(240, 180, 160, 0.45);
  border-left-width: 2px;
}

.artifact-open > :last-child { margin-bottom: 0; }

/* The walker is the natural feature: their own words run serif italic. */
.capture-words {
  margin: 0 0 1.25rem;
  padding: 0.15rem 0 0.15rem 0.9rem;
  border-left: 1px solid var(--line-strong);
  font-family: var(--font-capture);
  font-style: italic;
  font-size: 1.06rem;
  line-height: 1.45;
  color: var(--ink);
}

/* Ruled cells read left to right like a cockpit scan; empty cells are omitted. */
.instrument-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin: 0 0 1.5rem;
  padding: 0;
  list-style: none;
  border-top: 2px solid var(--line-strong);
  border-bottom: 1px solid var(--line);
}

.instrument-cell {
  flex: 1 1 8rem;
  padding: 0.6rem 0.75rem;
  border-right: 1px solid var(--line);
}

.instrument-cell:last-child { border-right: 0; }

.instrument-value {
  display: block;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.35rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
  color: var(--ink);
}

.instrument-label {
  display: block;
  margin-top: 0.2rem;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

/* Numbered mono citations, in the machine's sky. */
.sheet-sources {
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: source;
}

.sheet-sources li {
  display: flex;
  gap: 0.6rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--line);
  font-size: 0.86rem;
}

.sheet-sources li::before {
  counter-increment: source;
  content: "[" counter(source) "]";
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  color: var(--machine);
  padding-top: 0.15rem;
}

.sheet-sources a {
  color: var(--machine);
  overflow-wrap: anywhere;
}

.sheet-sources-head,
.sheet-footer {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.sheet-sources-head { margin: 0 0 0.5rem; }

/* The alternating scale bar closes the sheet. */
.scale-bar {
  height: 6px;
  margin: 0 0 0.75rem;
  border: 1px solid var(--line-strong);
  background: repeating-linear-gradient(
    to right,
    var(--line-strong) 0 12px,
    transparent 12px 24px
  );
}

.sheet-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1.25rem;
  justify-content: space-between;
  font-variant-numeric: tabular-nums;
}

.sheet-footer a { color: var(--identity); }

:focus-visible {
  outline: 2px solid var(--identity);
  outline-offset: 2px;
}

/* The kneeboard: term over value rather than a squeezed two-column grid. */
@media (max-width: 30rem) {
  .artifact-key { grid-template-columns: 1fr; gap: 0.15rem; }
  .artifact-key dd { margin-bottom: 0.6rem; }
  .artifact-key dd:last-child { margin-bottom: 0; }
}

/* The processing room: more air once there is room for it. */
@media (min-width: 48rem) {
  body { padding: 2.5rem 2rem 4rem; }
  .sheet { padding: 2.5rem 3rem; }
}

@media print {
  body { background: none; }
  .sheet { border: 0; outline: 0; }
}
`.trim();
