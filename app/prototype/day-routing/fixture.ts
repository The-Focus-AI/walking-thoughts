/**
 * PROTOTYPE — in-memory fixture for day-routing (end-of-walk dispatch) variants.
 * One day's walk, already enriched: every Thread carries the destination the
 * Enrichment proposed. Destinations, handoff targets, and the same-spot photo
 * cluster are all stand-ins — nothing is wired to sync, agents, or GitHub.
 */

export type ProtoDestination =
  | "spec" // flesh out against an existing Project/repo, hand to a coding agent
  | "todo" // capture onto the task list, no elaboration
  | "journal" // notebook: questions researched, observations worth keeping
  | "timeline" // the same-spot photo timeline / map journal
  | "drop"; // noise — bury it

export const DESTINATIONS: ProtoDestination[] = [
  "spec",
  "todo",
  "journal",
  "timeline",
  "drop",
];

export const DESTINATION_LABEL: Record<ProtoDestination, string> = {
  spec: "Spec",
  todo: "To-do",
  journal: "Journal",
  timeline: "Timeline",
  drop: "Drop",
};

/** Where a confirmed route actually goes — shown as the dispatch stub. */
export const DESTINATION_HANDOFF: Record<ProtoDestination, string> = {
  spec: "issue drafted in the Project's repo, handed to a coding agent",
  todo: "lands on the task list and the day digest checklist",
  journal: "filed into the notebook, draft-worthy lines flagged",
  timeline: "joins the same-spot photo strip on the map journal",
  drop: "buried — never shows in the queue again",
};

export type ProtoKind =
  | "question"
  | "idea"
  | "task"
  | "observation"
  | "place"
  | "media"
  | "noise";

export type ProtoProject = {
  id: string;
  name: string;
  /** Repo the Spec handoff would target, when the Project has one. */
  repo?: string;
};

export const PROJECTS: ProtoProject[] = [
  { id: "p-welton", name: "Welton", repo: "the-focus-ai/welton" },
  { id: "p-focus", name: "focus.ai", repo: "the-focus-ai/ops" },
  {
    id: "p-walking",
    name: "Walking Thoughts",
    repo: "the-focus-ai/walking-thoughts",
  },
];

export type ProtoMedia = {
  id: string;
  type: "photo" | "audio" | "video";
  label: string;
  /** CSS gradient stand-in for the real asset. */
  tone: string;
  /** Present when the Capture carried a fix. */
  gps?: { lat: number; lon: number };
};

export type ProtoThread = {
  id: string;
  title: string;
  time: string;
  place: string;
  kind: ProtoKind;
  /** The walker's words — first Capture text or transcript. */
  excerpt: string;
  /** One-line summary of the Enrichment. */
  enrichmentSummary: string;
  hasReport: boolean;
  /** The destination the Enrichment proposed (the thing under test). */
  proposedDestination: ProtoDestination;
  /** Project guess riding with a spec proposal. */
  proposedProjectId?: string;
  /** Set when the Enrichment could not tell and asked instead. */
  needsAWord?: string;
  /** Journal-only: the Enrichment thinks this could become a post. */
  draftWorthy?: boolean;
  media: ProtoMedia[];
};

export const DAY = {
  key: "2026-08-07",
  label: "Thursday, August 7",
  place: "Ridge loop via the cow gate",
  walkedMinutes: 52,
};

export const THREADS: ProtoThread[] = [
  {
    id: "t1",
    title: "Pull scheduling out of Welton as its own worker",
    time: "6:41",
    place: "Cow gate",
    kind: "idea",
    excerpt:
      "For Welton — what if the scheduling piece became its own little worker, separate queue, so the main loop never blocks on it. Try it as a sub-project first, just the queue and one consumer.",
    enrichmentSummary:
      "Restated as a ticket: extract scheduling into a queue-backed worker; open questions on delivery guarantees and where retries live. Two prior Welton Threads touch the queue.",
    hasReport: true,
    proposedDestination: "spec",
    proposedProjectId: "p-welton",
    media: [],
  },
  {
    id: "t2",
    title: "Token pool as pluggable billing backend",
    time: "6:48",
    place: "Ridge path",
    kind: "idea",
    excerpt:
      "The token pool thing again — token factories and resellers, per-user accounting. This connects to the LiteLLM comparison from last week.",
    enrichmentSummary:
      "Continues three prior token-billing Threads; sharpened into a compare-and-decide spec between LiteLLM and the AI Gateway for per-user accounting.",
    hasReport: true,
    proposedDestination: "spec",
    proposedProjectId: "p-focus",
    media: [],
  },
  {
    id: "t3",
    title: "Call Windwizer today",
    time: "6:52",
    place: "Ridge path",
    kind: "task",
    excerpt: "Make sure we call Windwizer today about the estimate.",
    enrichmentSummary:
      "The action and the contact — office opens 9:00, number on file from the June Thread. Three sentences, no essay.",
    hasReport: false,
    proposedDestination: "todo",
    media: [],
  },
  {
    id: "t4",
    title: "Schedule the colonoscopy and blood work",
    time: "6:53",
    place: "Ridge path",
    kind: "task",
    excerpt: "Call the doctor to schedule the colonoscopy and the blood work.",
    enrichmentSummary: "Two calls, one office. Portal link found.",
    hasReport: false,
    proposedDestination: "todo",
    media: [],
  },
  {
    id: "t5",
    title: "Why is it dark at night when there are so many stars",
    time: "7:02",
    place: "Overlook",
    kind: "question",
    excerpt:
      "Why is it dark at night when there are so many stars? There should be a star in every direction you look.",
    enrichmentSummary:
      "Olbers' paradox — the full cited report: finite age of the universe, expansion redshift, and why the night sky is the evidence.",
    hasReport: true,
    proposedDestination: "journal",
    media: [],
  },
  {
    id: "t6",
    title: "Nietzsche and the streams of tokens",
    time: "7:11",
    place: "Overlook",
    kind: "observation",
    excerpt:
      "The streams of tokens will wash away the differences — eternal recurrence but for model outputs. Everyone converging on the same sentence.",
    enrichmentSummary:
      "Argues back: names the idea (homogenization pressure), pairs it with Nietzsche's herd instinct, offers the counter-case. Reads like a draft.",
    hasReport: true,
    proposedDestination: "journal",
    draftWorthy: true,
    media: [],
  },
  {
    id: "t7",
    title: "Morning cow, day 41",
    time: "6:40",
    place: "Cow gate",
    kind: "place",
    excerpt: "Good morning cow.",
    enrichmentSummary:
      "Same spot as 40 prior mornings — 18 m from yesterday's frame. Fog lifting off the pasture.",
    hasReport: false,
    proposedDestination: "timeline",
    media: [
      {
        id: "m1",
        type: "photo",
        label: "Cow gate, fog",
        tone: "linear-gradient(160deg, #b9c7b4, #6d7f68 55%, #3f4d3c)",
        gps: { lat: 41.9502, lon: -73.5641 },
      },
    ],
  },
  {
    id: "t8",
    title: "Untitled video Capture",
    time: "7:19",
    place: "Stream crossing",
    kind: "media",
    excerpt: "",
    enrichmentSummary:
      "Nine seconds of the stream, high after the rain. No words on it.",
    hasReport: false,
    proposedDestination: "journal",
    needsAWord:
      "Is this just the stream after the rain, or is it about the washed-out crossing you mentioned in July?",
    media: [
      {
        id: "m2",
        type: "video",
        label: "Stream, 0:09",
        tone: "linear-gradient(150deg, #9db4c0, #52707f 60%, #2e4450)",
        gps: { lat: 41.9531, lon: -73.5602 },
      },
    ],
  },
  {
    id: "t9",
    title: "Testing",
    time: "7:24",
    place: "Driveway",
    kind: "noise",
    excerpt: "Testing testing.",
    enrichmentSummary: "Test entry.",
    hasReport: false,
    proposedDestination: "drop",
    media: [],
  },
];

/** Same-spot cluster stand-in: prior mornings at the cow gate. */
export const TIMELINE_SPOT = {
  name: "Cow gate",
  gps: { lat: 41.9503, lon: -73.5642 },
  radiusMeters: 25,
  days: 41,
  recent: [
    { day: "Aug 6", distanceMeters: 18, tone: "#8a9a83" },
    { day: "Aug 5", distanceMeters: 9, tone: "#7d8f78" },
    { day: "Aug 4", distanceMeters: 22, tone: "#93a48c" },
    { day: "Aug 3", distanceMeters: 12, tone: "#6f8069" },
    { day: "Aug 2", distanceMeters: 15, tone: "#a3b19b" },
  ],
};

export function projectName(id: string | null | undefined): string | null {
  if (!id) return null;
  return PROJECTS.find((project) => project.id === id)?.name ?? null;
}

export function projectRepo(id: string | null | undefined): string | null {
  if (!id) return null;
  return PROJECTS.find((project) => project.id === id)?.repo ?? null;
}
