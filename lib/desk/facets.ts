import {
  KIND_DESK_ORDER,
  KIND_LABELS,
  type MediaKind,
  type ResearchVerdict,
  type ThreadKind,
} from "@/lib/local-capture/types";

/**
 * The desk's filter model, in one place because two surfaces speak it: the
 * desktop facet rail and the phone's chip row. Both read and write the same
 * URL params, so a link made at the desk opens filtered on the phone and
 * back again (docs/desk-processing.md, S1).
 *
 * Nothing here touches React or the store — a Thread arrives already reduced
 * to the handful of facts the facets ask about.
 */

/** The rail's groups. Single-select inside a group; groups combine. */
export const FACET_GROUPS = [
  "state",
  "attention",
  "kind",
  "project",
  "media",
  "reports",
] as const;

export type FacetGroup = (typeof FACET_GROUPS)[number];

/** One selection per group, absent when that group is not narrowing. */
export type FacetSelection = Partial<Record<FacetGroup, string>>;

/**
 * A Lens re-stacks whatever the facets let through; it never filters. Days
 * is the default, so the desk still opens on the day-by-day frame.
 */
export const LENSES = ["days", "topics", "kind", "media", "reports"] as const;

export type Lens = (typeof LENSES)[number];

export const LENS_LABELS: Record<Lens, string> = {
  days: "Days",
  topics: "Topics",
  kind: "Kind",
  media: "Media",
  reports: "Reports",
};

export function isLens(value: string | null | undefined): value is Lens {
  return Boolean(value && (LENSES as readonly string[]).includes(value));
}

/**
 * A Thread reduced to what the facets and Lenses ask about. Built once per
 * Thread by the surface that has the store, kept free of store types so this
 * module stays a pure function of plain data.
 */
export type FacetThread = {
  id: string;
  dayKey: string;
  kind: ThreadKind | null;
  reviewed: boolean;
  researchVerdict: ResearchVerdict | null;
  /** The Enrichment asked something the walker has not answered. */
  needsWord: boolean;
  /** A Capture in this Thread could not sync. */
  needsAttention: boolean;
  projectId: string | null;
  projectName: string | null;
  mediaKinds: MediaKind[];
  /** The report earned a published Artifact page. */
  hasReport: boolean;
  /** At least one Enrichment has landed. */
  hasEnrichment: boolean;
};

/** The rail's rows, in the order the spec lists them. */
export type FacetOption = { value: string; label: string };

export const STATE_OPTIONS: FacetOption[] = [
  { value: "open", label: "Open" },
  { value: "reviewed", label: "Reviewed" },
  { value: "kept", label: "Research kept" },
];

export const ATTENTION_OPTIONS: FacetOption[] = [
  { value: "word", label: "Needs a word" },
  { value: "stuck", label: "Needs attention" },
];

export const KIND_OPTIONS: FacetOption[] = KIND_DESK_ORDER.map((kind) => ({
  value: kind,
  label: KIND_LABELS[kind],
}));

export const MEDIA_OPTIONS: FacetOption[] = [
  { value: "photos", label: "Photos" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
  { value: "text", label: "Text only" },
];

export const REPORT_OPTIONS: FacetOption[] = [
  { value: "full", label: "Full report" },
  { value: "quick", label: "Quick note" },
];

export const GROUP_LABELS: Record<FacetGroup, string> = {
  state: "State",
  attention: "Attention",
  kind: "Kind",
  project: "Project",
  media: "Media",
  reports: "Reports",
};

/** The Project rows are the walker's Projects, plus everything unfiled. */
export const UNFILED = "unfiled";

/**
 * The phone's four shipped chips, as selections in this model. Kept as an
 * accepted media value even though the rail never offers it: "has media"
 * is the union of the three media rows, and the legacy links must land
 * somewhere exact.
 */
const MEDIA_ANY = "any";

/** `?f=` links made before the rail existed. They must keep working. */
const LEGACY_FILTERS: Record<string, FacetSelection> = {
  word: { attention: "word" },
  attention: { attention: "stuck" },
  reports: { reports: "full" },
  media: { media: MEDIA_ANY },
};

function optionValues(group: FacetGroup): string[] | null {
  switch (group) {
    case "state":
      return STATE_OPTIONS.map((option) => option.value);
    case "attention":
      return ATTENTION_OPTIONS.map((option) => option.value);
    case "kind":
      return KIND_OPTIONS.map((option) => option.value);
    case "media":
      return [...MEDIA_OPTIONS.map((option) => option.value), MEDIA_ANY];
    case "reports":
      return REPORT_OPTIONS.map((option) => option.value);
    case "project":
      // Any Project id is legal; the rail only renders the ones that exist.
      return null;
  }
}

function isFacetValue(group: FacetGroup, value: string): boolean {
  const allowed = optionValues(group);
  return allowed === null ? value.length > 0 : allowed.includes(value);
}

/**
 * Read the selection out of the URL. Unknown values are dropped rather than
 * narrowing to nothing, and a legacy `?f=` fills in any group the newer
 * params left empty.
 */
export function readFacets(
  params: URLSearchParams | null | undefined,
): FacetSelection {
  const selection: FacetSelection = {};
  if (!params) return selection;
  for (const group of FACET_GROUPS) {
    const value = params.get(group);
    if (value && isFacetValue(group, value)) selection[group] = value;
  }
  const legacy = LEGACY_FILTERS[params.get("f") ?? ""];
  if (legacy) {
    for (const [group, value] of Object.entries(legacy) as Array<
      [FacetGroup, string]
    >) {
      if (!selection[group]) selection[group] = value;
    }
  }
  return selection;
}

export function readLens(params: URLSearchParams | null | undefined): Lens {
  const value = params?.get("lens");
  return isLens(value) ? value : "days";
}

export function hasFacets(selection: FacetSelection): boolean {
  return FACET_GROUPS.some((group) => Boolean(selection[group]));
}

/** Toggle a row: choosing the active value in a group clears that group. */
export function toggleFacet(
  selection: FacetSelection,
  group: FacetGroup,
  value: string,
): FacetSelection {
  const next: FacetSelection = { ...selection };
  if (next[group] === value) delete next[group];
  else next[group] = value;
  return next;
}

/**
 * The link for a selection. The legacy `f` is never written back — the rail
 * and the chips both speak the newer params, and old links translate on read.
 */
export function facetHref(
  base: string,
  selection: FacetSelection,
  lens: Lens = "days",
): string {
  const params = new URLSearchParams();
  for (const group of FACET_GROUPS) {
    const value = selection[group];
    if (value) params.set(group, value);
  }
  if (lens !== "days") params.set("lens", lens);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function matchesGroup(
  thread: FacetThread,
  group: FacetGroup,
  value: string,
): boolean {
  switch (group) {
    case "state":
      if (value === "open") return !thread.reviewed;
      if (value === "reviewed") return thread.reviewed;
      return thread.researchVerdict === "kept";
    case "attention":
      return value === "word" ? thread.needsWord : thread.needsAttention;
    case "kind":
      return thread.kind === value;
    case "project":
      return value === UNFILED
        ? !thread.projectId
        : thread.projectId === value;
    case "media":
      if (value === "text") return thread.mediaKinds.length === 0;
      if (value === MEDIA_ANY) return thread.mediaKinds.length > 0;
      return thread.mediaKinds.includes(
        value === "photos" ? "image" : (value as MediaKind),
      );
    case "reports":
      return value === "full"
        ? thread.hasReport
        : !thread.hasReport && thread.hasEnrichment;
  }
}

/** Every active group must agree — the groups combine, they do not union. */
export function matchesFacets(
  thread: FacetThread,
  selection: FacetSelection,
  options?: { except?: FacetGroup },
): boolean {
  for (const group of FACET_GROUPS) {
    if (group === options?.except) continue;
    const value = selection[group];
    if (value && !matchesGroup(thread, group, value)) return false;
  }
  return true;
}

export function filterThreads(
  threads: FacetThread[],
  selection: FacetSelection,
): FacetThread[] {
  return threads.filter((thread) => matchesFacets(thread, selection));
}

/**
 * What each row would show if it were chosen. A group's own selection is
 * left out of its own counts, so the rail always says how many Threads the
 * walker would get by switching rows inside that group — the other groups
 * still narrow it.
 */
export function facetCounts(
  threads: FacetThread[],
  selection: FacetSelection,
  projects: Array<{ id: string; name: string }> = [],
): Record<FacetGroup, Record<string, number>> {
  const counts = {
    state: {},
    attention: {},
    kind: {},
    project: {},
    media: {},
    reports: {},
  } as Record<FacetGroup, Record<string, number>>;

  for (const group of FACET_GROUPS) {
    const values =
      group === "project"
        ? [...projects.map((project) => project.id), UNFILED]
        : (optionValues(group) ?? []);
    const pool = threads.filter((thread) =>
      matchesFacets(thread, selection, { except: group }),
    );
    for (const value of values) {
      counts[group][value] = pool.filter((thread) =>
        matchesGroup(thread, group, value),
      ).length;
    }
  }
  return counts;
}

export type LensStack = {
  key: string;
  title: string;
  threadIds: string[];
};

/**
 * One bucket per Thread, so re-stacking never changes what is on screen. A
 * Thread with both a photo and a clip stacks under the strongest media it
 * holds rather than appearing twice.
 */
function mediaBucket(thread: FacetThread): { key: string; title: string } {
  if (thread.mediaKinds.includes("video"))
    return { key: "video", title: "Video" };
  if (thread.mediaKinds.includes("image"))
    return { key: "photos", title: "Photos" };
  if (thread.mediaKinds.includes("audio"))
    return { key: "audio", title: "Audio" };
  return { key: "text", title: "Text only" };
}

function bucketFor(
  thread: FacetThread,
  lens: Lens,
): { key: string; title: string } {
  switch (lens) {
    case "days":
      return { key: thread.dayKey, title: thread.dayKey };
    case "topics":
      return thread.projectId
        ? {
            key: thread.projectId,
            title: thread.projectName ?? "Project",
          }
        : { key: UNFILED, title: "Unfiled" };
    case "kind":
      return thread.kind
        ? { key: thread.kind, title: KIND_LABELS[thread.kind] }
        : { key: "unclassified", title: "Not yet classified" };
    case "media":
      return mediaBucket(thread);
    case "reports":
      if (thread.hasReport) return { key: "full", title: "Full report" };
      if (thread.hasEnrichment) return { key: "quick", title: "Quick note" };
      return { key: "none", title: "Nothing written yet" };
  }
}

const LENS_ORDER: Partial<Record<Lens, string[]>> = {
  kind: [...KIND_DESK_ORDER, "unclassified"],
  media: ["photos", "video", "audio", "text"],
  reports: ["full", "quick", "none"],
};

/**
 * Stack the Threads the facets let through. Days run newest first; the other
 * Lenses follow the desk order the rest of the app uses, with anything
 * unnamed last. Membership is identical whichever Lens is chosen.
 */
export function stackByLens(threads: FacetThread[], lens: Lens): LensStack[] {
  const stacks = new Map<string, LensStack>();
  for (const thread of threads) {
    const bucket = bucketFor(thread, lens);
    const stack = stacks.get(bucket.key) ?? {
      key: bucket.key,
      title: bucket.title,
      threadIds: [],
    };
    stack.threadIds.push(thread.id);
    stacks.set(bucket.key, stack);
  }
  const list = [...stacks.values()];
  if (lens === "days") return list.sort((a, b) => (a.key < b.key ? 1 : -1));
  const order = LENS_ORDER[lens];
  if (!order) return list.sort((a, b) => a.title.localeCompare(b.title));
  return list.sort((a, b) => {
    const ai = order.indexOf(a.key);
    const bi = order.indexOf(b.key);
    return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
  });
}
