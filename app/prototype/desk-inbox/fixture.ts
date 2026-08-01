/**
 * PROTOTYPE — in-memory fixture for desk-inbox (desktop processing) variants.
 * A backlog of unreviewed Threads across three walks, with kind/project
 * guesses, media, and precomputed "similar past Threads" links standing in
 * for an embedding index. Not wired to sync or the review API.
 */

export type ProtoMedia = {
  id: string;
  type: "photo" | "audio" | "video";
  label: string;
  /** CSS gradient stand-in for the real asset. */
  tone: string;
  bytes: number;
};

export type ProtoRelated = {
  threadId: string;
  /** 0–1 cosine-similarity stand-in. */
  score: number;
  /** The mention both Threads share, when there is one. */
  sharedMention?: string;
};

export type ProtoQueueThread = {
  id: string;
  title: string;
  dayKey: string;
  walkedAt: string;
  place: string;
  /** The walker's words — first Capture text or transcript. */
  excerpt: string;
  /** One-line summary of the Enrichment report. */
  enrichmentSummary: string;
  /** Kind the Enrichment guessed (confirmable at the desk). */
  kindGuess: ProtoKind;
  /** Project the Enrichment guessed, if any. */
  projectGuess?: string;
  mentions: string[];
  media: ProtoMedia[];
  related: ProtoRelated[];
};

export type ProtoKind =
  | "question"
  | "idea"
  | "task"
  | "observation"
  | "place"
  | "media"
  | "noise";

export const KINDS: ProtoKind[] = [
  "question",
  "idea",
  "task",
  "observation",
  "place",
  "media",
  "noise",
];

export type ProtoProject = {
  id: string;
  name: string;
  proposed?: boolean;
};

export const PROJECTS: ProtoProject[] = [
  { id: "p-walls", name: "Stone walls book" },
  { id: "p-trail", name: "Trail stewardship" },
  { id: "p-reservoir", name: "Reservoir history", proposed: true },
];

export type ProtoDay = {
  key: string;
  label: string;
  region: string;
  distanceKm: number;
};

export const DAYS: ProtoDay[] = [
  { key: "2026-07-29", label: "Wed Jul 29", region: "Cornwall Bridge", distanceKm: 5.8 },
  { key: "2026-07-30", label: "Thu Jul 30", region: "Mohawk Trail", distanceKm: 7.2 },
  { key: "2026-07-31", label: "Fri Jul 31", region: "Cornwall Bridge", distanceKm: 4.1 },
];

/** Already-reviewed Threads that similarity links point back to. */
export type ProtoPastThread = {
  id: string;
  title: string;
  walkedOn: string;
  kind: ProtoKind;
  projectId?: string;
  note: string;
};

export const PAST_THREADS: ProtoPastThread[] = [
  {
    id: "past-1",
    title: "Stone wall running into the reservoir",
    walkedOn: "2026-07-19",
    kind: "question",
    projectId: "p-walls",
    note: "Research dated the walls 1790–1840; report kept.",
  },
  {
    id: "past-2",
    title: "Who owned the flooded farms",
    walkedOn: "2026-07-21",
    kind: "question",
    projectId: "p-reservoir",
    note: "Three farm families traced; follow-up still open.",
  },
  {
    id: "past-3",
    title: "Blowdown across the blue blaze",
    walkedOn: "2026-07-24",
    kind: "task",
    projectId: "p-trail",
    note: "Reported to the land trust; filed as task.",
  },
  {
    id: "past-4",
    title: "Chestnut stump sprouts near the ledge",
    walkedOn: "2026-07-12",
    kind: "observation",
    note: "Identified as American chestnut regrowth.",
  },
];

const MB = 1024 * 1024;

export const QUEUE: ProtoQueueThread[] = [
  {
    id: "t1",
    title: "Second wall meets the first at a corner",
    dayKey: "2026-07-29",
    walkedAt: "2026-07-29T08:12:00-04:00",
    place: "Reservoir ridge",
    excerpt:
      "Found where the downhill wall corners into a second one running along the contour. Feels like a field boundary, not a property line.",
    enrichmentSummary:
      "Corner junctions like this usually mark enclosure-era field divisions; the contour wall likely predates the downhill one.",
    kindGuess: "question",
    projectGuess: "p-walls",
    mentions: ["stone walls", "reservoir", "field boundary"],
    media: [
      { id: "m1", type: "photo", label: "Wall corner, moss side", tone: "linear-gradient(135deg,#2c3b2d,#54684a)", bytes: 3.2 * MB },
      { id: "m2", type: "photo", label: "Contour wall running north", tone: "linear-gradient(135deg,#31402f,#6b7a54)", bytes: 2.8 * MB },
    ],
    related: [
      { threadId: "past-1", score: 0.91, sharedMention: "stone walls" },
      { threadId: "past-2", score: 0.62, sharedMention: "reservoir" },
    ],
  },
  {
    id: "t2",
    title: "Culvert half blocked under the woods road",
    dayKey: "2026-07-29",
    walkedAt: "2026-07-29T08:47:00-04:00",
    place: "Woods road crossing",
    excerpt:
      "Culvert is half silted up again, water cutting a channel across the road surface. Should tell the land trust before fall rains.",
    enrichmentSummary:
      "Maintenance task: silted culvert; suggests reporting with GPS point and photo to the trail crew.",
    kindGuess: "task",
    projectGuess: "p-trail",
    mentions: ["culvert", "woods road", "land trust"],
    media: [
      { id: "m3", type: "photo", label: "Silted culvert mouth", tone: "linear-gradient(135deg,#3a3327,#6e5f3f)", bytes: 3.6 * MB },
    ],
    related: [{ threadId: "past-3", score: 0.78, sharedMention: "land trust" }],
  },
  {
    id: "t3",
    title: "Hawk calling over the clearcut",
    dayKey: "2026-07-29",
    walkedAt: "2026-07-29T09:05:00-04:00",
    place: "Old clearcut",
    excerpt: "That two-note call again — third time this month over the clearcut.",
    enrichmentSummary:
      "Call pattern matches broad-winged hawk; late July fits pre-migration staging.",
    kindGuess: "observation",
    mentions: ["broad-winged hawk", "clearcut"],
    media: [
      { id: "m4", type: "audio", label: "Hawk call, 0:41", tone: "linear-gradient(135deg,#26303a,#3d5468)", bytes: 1.1 * MB },
    ],
    related: [],
  },
  {
    id: "t4",
    title: "Book idea: walls as a reading of the land",
    dayKey: "2026-07-30",
    walkedAt: "2026-07-30T07:58:00-04:00",
    place: "Mohawk overlook",
    excerpt:
      "Chapter structure could follow one wall from valley floor to ridge — each elevation band is a different era of land use.",
    enrichmentSummary:
      "Sharpened the outline: five elevation bands, each pairing a wall segment with its era; suggested two comparable books.",
    kindGuess: "idea",
    projectGuess: "p-walls",
    mentions: ["stone walls", "book outline"],
    media: [],
    related: [{ threadId: "past-1", score: 0.84, sharedMention: "stone walls" }],
  },
  {
    id: "t5",
    title: "Charcoal mound flat on the north slope",
    dayKey: "2026-07-30",
    walkedAt: "2026-07-30T08:40:00-04:00",
    place: "North slope",
    excerpt:
      "Perfectly round flat spot, maybe ten meters across, black soil under the leaf litter. Charcoal hearth?",
    enrichmentSummary:
      "Almost certainly a colliers' hearth; this slope supplied the Cornwall iron furnaces. Report includes an 1850s map overlay.",
    kindGuess: "question",
    projectGuess: "p-reservoir",
    mentions: ["charcoal hearth", "iron furnace", "north slope"],
    media: [
      { id: "m5", type: "photo", label: "Hearth flat, leaf litter pulled back", tone: "linear-gradient(135deg,#241f1c,#4a3f33)", bytes: 3.1 * MB },
      { id: "m6", type: "photo", label: "Black soil handful", tone: "linear-gradient(135deg,#1d1a17,#3a322a)", bytes: 2.9 * MB },
      { id: "m7", type: "video", label: "Pan across the flat, 0:19", tone: "linear-gradient(135deg,#2a2f26,#50583f)", bytes: 24.5 * MB },
    ],
    related: [
      { threadId: "past-2", score: 0.71, sharedMention: "iron furnace" },
      { threadId: "past-1", score: 0.58 },
    ],
  },
  {
    id: "t6",
    title: "Remember to fix the gate latch photo",
    dayKey: "2026-07-30",
    walkedAt: "2026-07-30T09:22:00-04:00",
    place: "Trailhead",
    excerpt: "Blurry shot of the broken latch — retake next time.",
    enrichmentSummary: "Low-signal capture; likely a reminder, not research.",
    kindGuess: "noise",
    mentions: ["trailhead gate"],
    media: [
      { id: "m8", type: "photo", label: "Blurry latch", tone: "linear-gradient(135deg,#33352f,#565a4e)", bytes: 2.2 * MB },
    ],
    related: [],
  },
  {
    id: "t7",
    title: "Chestnut sprouts again, now chest high",
    dayKey: "2026-07-31",
    walkedAt: "2026-07-31T08:05:00-04:00",
    place: "Ledge trail",
    excerpt:
      "The stump sprouts from earlier this month are chest high now, leaves look clean. Same clone as the ledge cluster?",
    enrichmentSummary:
      "Growth rate is consistent with root-collar sprouts; blight usually appears at 5–8 years. Suggests marking for yearly checks.",
    kindGuess: "observation",
    mentions: ["American chestnut", "ledge trail"],
    media: [
      { id: "m9", type: "photo", label: "Sprout cluster, chest high", tone: "linear-gradient(135deg,#2f4a2d,#71915a)", bytes: 3.4 * MB },
    ],
    related: [{ threadId: "past-4", score: 0.93, sharedMention: "American chestnut" }],
  },
  {
    id: "t8",
    title: "Where does the penstock trace go",
    dayKey: "2026-07-31",
    walkedAt: "2026-07-31T08:51:00-04:00",
    place: "Below the dam",
    excerpt:
      "Straight terrace cut below the dam, too level to be a road. Penstock or flume line for the old mill?",
    enrichmentSummary:
      "Likely the 1902 penstock alignment; report traces it to the mill foundation and links two survey photos.",
    kindGuess: "question",
    projectGuess: "p-reservoir",
    mentions: ["penstock", "reservoir", "mill"],
    media: [
      { id: "m10", type: "photo", label: "Terrace cut, looking downstream", tone: "linear-gradient(135deg,#27333b,#4d616c)", bytes: 3.0 * MB },
      { id: "m11", type: "audio", label: "Voice note, 1:12", tone: "linear-gradient(135deg,#2b2f38,#4a5468)", bytes: 1.9 * MB },
    ],
    related: [
      { threadId: "past-2", score: 0.88, sharedMention: "reservoir" },
      { threadId: "past-1", score: 0.64, sharedMention: "reservoir" },
    ],
  },
];

export function dayOf(thread: ProtoQueueThread): ProtoDay {
  return DAYS.find((day) => day.key === thread.dayKey) ?? DAYS[0];
}

export function pastThread(id: string): ProtoPastThread | undefined {
  return PAST_THREADS.find((thread) => thread.id === id);
}

export function projectName(id?: string | null): string | null {
  if (!id) return null;
  return PROJECTS.find((project) => project.id === id)?.name ?? null;
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
