/**
 * PROTOTYPE — candidate token sets for the DESIGN.md effort.
 *
 * Each direction is a would-be DESIGN.md frontmatter: purpose-named colors,
 * system font stacks, radii, spacing. The page renders these values both as
 * CSS custom properties (so the specimen uses them) and as a visible token
 * sheet (so the prototype exposes its own state).
 */

export type DirectionKey = "a" | "b" | "c" | "d";

export type Direction = {
  key: DirectionKey;
  name: string;
  tagline: string;
  contests: string;
  colors: {
    background: string;
    surface: string;
    raised: string;
    text: string;
    muted: string;
    line: string;
    action: string;
    actionText: string;
    identity: string;
    attention: string;
    machine: string;
    record: string;
    recordText: string;
  };
  typography: {
    display: string;
    body: string;
    mono: string;
    displayWeight: string;
    displayTransform: "none" | "uppercase";
    displayTracking: string;
  };
  rounded: { card: string; control: string; chip: string };
  spacing: { base: string; scale: string[] };
  borderWidth: string;
};

export const DIRECTIONS: Direction[] = [
  {
    key: "a",
    name: "Forest Night",
    tagline: "The woods at dusk — the shipped identity, systematized.",
    contests: "Incumbent: keeps dark, warm, serif, soft.",
    colors: {
      background: "#17231b",
      surface: "#1e2c22",
      raised: "#24352a",
      text: "#f2f1e8",
      muted: "#b9bcae",
      line: "rgba(242, 241, 232, 0.16)",
      action: "#f4cf72",
      actionText: "#17231b",
      identity: "#a9d18f",
      attention: "#f0b4a0",
      machine: "#8fb8d8",
      record: "#b42318",
      recordText: "#fff8f0",
    },
    typography: {
      display: 'Georgia, "Times New Roman", serif',
      body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
      displayWeight: "500",
      displayTransform: "none",
      displayTracking: "-0.03em",
    },
    rounded: { card: "16px", control: "12px", chip: "999px" },
    spacing: { base: "4px", scale: ["4", "8", "12", "16", "24", "32", "48"] },
    borderWidth: "1px",
  },
  {
    key: "b",
    name: "Field Notebook",
    tagline: "A printed field guide on warm paper — editorial, ruled, flat.",
    contests: "Contests dark-by-default and card chrome.",
    colors: {
      background: "#f6f3ea",
      surface: "#fdfbf3",
      raised: "#efe9da",
      text: "#26291f",
      muted: "rgba(38, 41, 31, 0.64)",
      line: "rgba(38, 41, 31, 0.22)",
      action: "#33523a",
      actionText: "#f6f3ea",
      identity: "#48663c",
      attention: "#a34a24",
      machine: "#38617e",
      record: "#a3271a",
      recordText: "#fbf6ec",
    },
    typography: {
      display: 'Georgia, "Times New Roman", serif',
      body: 'Georgia, "Times New Roman", serif',
      mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
      displayWeight: "500",
      displayTransform: "none",
      displayTracking: "-0.02em",
    },
    rounded: { card: "6px", control: "6px", chip: "3px" },
    spacing: { base: "8px", scale: ["8", "16", "24", "32", "48", "64"] },
    borderWidth: "1px",
  },
  {
    key: "c",
    name: "Instrument Panel",
    tagline: "A GPS unit at dawn — cool, dense, mono, exact.",
    contests: "Contests warmth, serif, and soft corners.",
    colors: {
      background: "#0d1114",
      surface: "#151b20",
      raised: "#1c242b",
      text: "#e6ecf0",
      muted: "#93a1ab",
      line: "rgba(230, 236, 240, 0.22)",
      action: "#ff8a3d",
      actionText: "#12161a",
      identity: "#6fe08c",
      attention: "#ffd35c",
      machine: "#56c8f0",
      record: "#ff4f42",
      recordText: "#12161a",
    },
    typography: {
      display: "ui-monospace, SFMono-Regular, Menlo, monospace",
      body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
      displayWeight: "700",
      displayTransform: "uppercase",
      displayTracking: "0.04em",
    },
    rounded: { card: "3px", control: "3px", chip: "3px" },
    spacing: { base: "4px", scale: ["4", "8", "12", "16", "20", "28", "40"] },
    borderWidth: "1.5px",
  },
  {
    key: "d",
    name: "Ranger Duotone",
    tagline: "A WPA park poster — cream and pine, chunky, one gold accent.",
    contests: "Contests the quiet multi-accent role system.",
    colors: {
      background: "#f2ead8",
      surface: "#f2ead8",
      raised: "#22402f",
      text: "#22402f",
      muted: "rgba(34, 64, 47, 0.68)",
      line: "#22402f",
      action: "#dda032",
      actionText: "#22402f",
      identity: "#22402f",
      attention: "#b4552d",
      machine: "#22402f",
      record: "#c23b22",
      recordText: "#f8f2e2",
    },
    typography: {
      display: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
      displayWeight: "900",
      displayTransform: "uppercase",
      displayTracking: "0.02em",
    },
    rounded: { card: "2px", control: "2px", chip: "0px" },
    spacing: { base: "8px", scale: ["8", "16", "24", "40", "56"] },
    borderWidth: "2px",
  },
];

export function directionFor(key: string | null): Direction {
  return DIRECTIONS.find((d) => d.key === key) ?? DIRECTIONS[0];
}

/**
 * Type voices — typography-only variants rendered over the winning
 * Forest Night tokens. Webfont voices load from Google Fonts in the
 * prototype only; committing one means self-hosting the woff2 files in
 * the offline shell.
 */
export type TypeVoice = {
  key: DirectionKey;
  name: string;
  tagline: string;
  display: string;
  body: string;
  mono: string;
  displayWeight: string;
  displayTransform: "none" | "uppercase";
  displayTracking: string;
  bodyLineHeight: string;
  webfont: boolean;
};

export const TYPE_VOICES: TypeVoice[] = [
  {
    key: "a",
    name: "Georgia journal",
    tagline: "The incumbent: Georgia names things, system sans does the work.",
    display: 'Georgia, "Times New Roman", serif',
    body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
    displayWeight: "500",
    displayTransform: "none",
    displayTracking: "-0.03em",
    bodyLineHeight: "1.5",
    webfont: false,
  },
  {
    key: "b",
    name: "Bookish",
    tagline: "Serif body everywhere — a printed journal page, denser ink.",
    display: 'Charter, Georgia, "Times New Roman", serif',
    body: 'Charter, Georgia, "Times New Roman", serif',
    mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
    displayWeight: "500",
    displayTransform: "none",
    displayTracking: "-0.02em",
    bodyLineHeight: "1.58",
    webfont: false,
  },
  {
    key: "c",
    name: "Fraunces field guide",
    tagline: "A warm old-style display serif — almost hand-set. Webfont.",
    display: '"Fraunces", Georgia, "Times New Roman", serif',
    body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    displayWeight: "550",
    displayTransform: "none",
    displayTracking: "-0.02em",
    bodyLineHeight: "1.5",
    webfont: true,
  },
  {
    key: "d",
    name: "Typewriter logbook",
    tagline: "Courier Prime titles and facts — expedition log energy. Webfont.",
    display: '"Courier Prime", "Courier New", monospace',
    body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: '"Courier Prime", "Courier New", monospace',
    displayWeight: "700",
    displayTransform: "none",
    displayTracking: "-0.01em",
    bodyLineHeight: "1.5",
    webfont: true,
  },
];

export function typeVoiceFor(key: string | null): TypeVoice {
  return TYPE_VOICES.find((v) => v.key === key) ?? TYPE_VOICES[0];
}

export function cssVarsForTypeVoice(voice: TypeVoice): Record<string, string> {
  const base = cssVarsFor(DIRECTIONS[0]);
  return {
    ...base,
    "--dd-f-display": voice.display,
    "--dd-f-body": voice.body,
    "--dd-f-mono": voice.mono,
    "--dd-display-weight": voice.displayWeight,
    "--dd-display-transform": voice.displayTransform,
    "--dd-display-tracking": voice.displayTracking,
  };
}

export function cssVarsFor(d: Direction): Record<string, string> {
  return {
    "--dd-bg": d.colors.background,
    "--dd-surface": d.colors.surface,
    "--dd-raised": d.colors.raised,
    "--dd-text": d.colors.text,
    "--dd-muted": d.colors.muted,
    "--dd-line": d.colors.line,
    "--dd-action": d.colors.action,
    "--dd-action-text": d.colors.actionText,
    "--dd-identity": d.colors.identity,
    "--dd-attention": d.colors.attention,
    "--dd-machine": d.colors.machine,
    "--dd-record": d.colors.record,
    "--dd-record-text": d.colors.recordText,
    "--dd-r-card": d.rounded.card,
    "--dd-r-control": d.rounded.control,
    "--dd-r-chip": d.rounded.chip,
    "--dd-f-display": d.typography.display,
    "--dd-f-body": d.typography.body,
    "--dd-f-mono": d.typography.mono,
    "--dd-display-weight": d.typography.displayWeight,
    "--dd-display-transform": d.typography.displayTransform,
    "--dd-display-tracking": d.typography.displayTracking,
    "--dd-border-w": d.borderWidth,
  };
}
