/**
 * PROTOTYPE — in-memory fixture for thread-review UI variants.
 * A finished walk with Captures, markdown Enrichments, research traces,
 * and open follow-ups. Not wired to the Capture store / sync APIs.
 */

export type ProtoStatus =
  | "saved_locally"
  | "syncing"
  | "enriching"
  | "complete"
  | "needs_attention";

export type ProtoPhoto = {
  id: string;
  label: string;
  /** CSS gradient stand-in for the real image. */
  tone: string;
};

export type ProtoResearchStep = {
  tool: "exa" | "firecrawl" | "model";
  action: string;
  detail: string;
};

export type ProtoSource = {
  title: string;
  url: string;
  note?: string;
};

export type ProtoEnrichment = {
  id: string;
  /** Markdown body — headings, lists, bold, links. */
  markdown: string;
  model: string;
  createdAt: string;
  sources: ProtoSource[];
  research: ProtoResearchStep[];
  followUps: string[];
};

export type ProtoCapture = {
  id: string;
  kind: "text" | "photo" | "audio";
  text: string;
  /** Transcript for audio captures. */
  transcript?: string;
  status: ProtoStatus;
  sequence: number;
  createdAt: string;
  place?: string;
  photos: ProtoPhoto[];
  enrichment?: ProtoEnrichment;
  /** True when this Capture was added later, while reviewing. */
  isFollowUp?: boolean;
};

export type ProtoThread = {
  title: string;
  walkedOn: string;
  region: string;
  distanceKm: number;
  revision: number;
  captures: ProtoCapture[];
};

export const REVIEW_THREAD: ProtoThread = {
  title: "Stone walls above the reservoir",
  walkedOn: "2026-07-19",
  region: "Cornwall Bridge",
  distanceKm: 6.4,
  revision: 9,
  captures: [
    {
      id: "c1",
      kind: "photo",
      text: "Stone wall running straight downhill into the reservoir. Who stacked these, and when?",
      status: "complete",
      sequence: 1,
      createdAt: "2026-07-19T14:02:00.000Z",
      place: "Ridge trail, 0.8 km in",
      photos: [
        { id: "p1", label: "Wall into water", tone: "linear-gradient(150deg, #5b6d54, #2c3a2e 65%, #1c2b33)" },
        { id: "p2", label: "Capstone detail", tone: "linear-gradient(150deg, #857b64, #4c4a3a 70%, #2a2d24)" },
      ],
      enrichment: {
        id: "e1",
        model: "gateway/gemini-2.5-flash",
        createdAt: "2026-07-19T16:40:00.000Z",
        markdown: [
          "## Why the wall runs into the water",
          "",
          "These are almost certainly **sheep-boom era field walls** (roughly 1810–1840). The wall predates the reservoir — it ran between pastures, and the valley was flooded later.",
          "",
          "- New England farmers cleared glacial till and stacked it at field edges; Connecticut's highlands were ~70% cleared pasture by 1850.",
          "- Walls that *disappear into lakes* usually mark valleys dammed for water supply in the late 1800s–1920s.",
          "- The straight, single-stacked style (\"farmer's wall\") suggests boundary marking, not livestock containment.",
          "",
          "> Robert Thorson estimates ~380,000 km of stone walls in New England — laid end to end, farther than the distance to the Moon.",
          "",
          "The reservoir here was created around **1912** for the mill towns downstream, which fits the drowned-wall pattern.",
        ].join("\n"),
        sources: [
          { title: "Stone Wall Initiative — UConn", url: "https://stonewall.uconn.edu/", note: "wall typology" },
          { title: "Sheep boom in New England (JSTOR)", url: "https://example.org/sheep-boom", note: "1810–1840 clearing" },
          { title: "Cornwall CT town history", url: "https://example.org/cornwall-history", note: "reservoir date" },
        ],
        research: [
          { tool: "exa", action: "Searched", detail: "\"stone wall\" reservoir New England drowned farmland — 6 results" },
          { tool: "firecrawl", action: "Read", detail: "stonewall.uconn.edu/wall-types (3.1k words)" },
          { tool: "firecrawl", action: "Read", detail: "cornwallhistoricalsociety.org/reservoir (1.4k words)" },
          { tool: "model", action: "Annotated", detail: "matched capstone photo against single-stack typology" },
        ],
        followUps: [
          "Check the 1874 Beers atlas for the property line this wall marked",
          "Walk the wall uphill next time — look for a cellar hole at the corner",
        ],
      },
    },
    {
      id: "c2",
      kind: "photo",
      text: "Fern colony on the north side — which fern is this?",
      status: "complete",
      sequence: 2,
      createdAt: "2026-07-19T14:31:00.000Z",
      place: "Brook crossing",
      photos: [
        { id: "p3", label: "Fern frond", tone: "linear-gradient(150deg, #6f9b57, #3d5c35 70%, #22331f)" },
      ],
      enrichment: {
        id: "e2",
        model: "gateway/gemini-2.5-flash",
        createdAt: "2026-07-19T16:41:00.000Z",
        markdown: [
          "**Interrupted fern** (*Claytosmunda claytoniana*) — the fertile pinnae \"interrupt\" the middle of the frond, which matches the dark segments in your photo.",
          "",
          "- Likes exactly this: moist, shaded, north-facing slopes near brooks.",
          "- Often confused with cinnamon fern; cinnamon carries spores on a *separate* stalk.",
        ].join("\n"),
        sources: [
          { title: "GoBotany — interrupted fern", url: "https://gobotany.nativeplanttrust.org/", note: "ID keys" },
        ],
        research: [
          { tool: "model", action: "Identified", detail: "photo → 2 candidate species" },
          { tool: "exa", action: "Searched", detail: "interrupted vs cinnamon fern fertile fronds — 4 results" },
        ],
        followUps: ["Photograph the fertile fronds up close to confirm"],
      },
    },
    {
      id: "c3",
      kind: "audio",
      text: "Audio note — 0:41",
      transcript:
        "Creek is a lot louder after the bend than it was in May. Wondering if that's the dam release schedule or just last week's rain. Also there's a new beaver dam starting near the two dead hemlocks.",
      status: "complete",
      sequence: 3,
      createdAt: "2026-07-19T15:04:00.000Z",
      place: "Furnace Brook bend",
      photos: [],
      enrichment: {
        id: "e3",
        model: "gateway/claude-haiku",
        createdAt: "2026-07-19T16:44:00.000Z",
        markdown: [
          "Two separate things worth remembering here:",
          "",
          "1. **Flow** — Furnace Brook is not dam-controlled; the louder water is rain-driven. USGS gauge upstream shows a spike on **Jul 16** (~3× base flow).",
          "2. **Beaver dam** — new dams near standing dead hemlocks are common where woolly adelgid opened the canopy; expect a pond forming within a season.",
        ].join("\n"),
        sources: [
          { title: "USGS gauge 01199988", url: "https://waterdata.usgs.gov/", note: "Jul 16 spike" },
        ],
        research: [
          { tool: "exa", action: "Searched", detail: "Furnace Brook Cornwall dam release — 5 results, none authoritative" },
          { tool: "firecrawl", action: "Read", detail: "waterdata.usgs.gov gauge page (tables)" },
        ],
        followUps: ["Re-record the creek at the same spot in August and compare"],
      },
    },
    {
      id: "c4",
      kind: "photo",
      text: "Is this poison ivy or Virginia creeper? It's all over the south stile.",
      status: "enriching",
      sequence: 4,
      createdAt: "2026-07-19T15:37:00.000Z",
      place: "South stile",
      photos: [
        { id: "p4", label: "Vine on stile", tone: "linear-gradient(150deg, #7a8f4e, #55603a 65%, #33321f)" },
      ],
    },
    {
      id: "c5",
      kind: "text",
      text: "Bench idea: the lookout clearing faces due west — sunset bench? Ask the land trust.",
      status: "saved_locally",
      sequence: 5,
      createdAt: "2026-07-19T15:58:00.000Z",
      place: "Lookout clearing",
      photos: [],
    },
    {
      id: "c6",
      kind: "text",
      text: "Follow-up: what did the Beers atlas show for the ridge parcels?",
      status: "complete",
      sequence: 6,
      createdAt: "2026-07-20T09:12:00.000Z",
      isFollowUp: true,
      photos: [],
      enrichment: {
        id: "e4",
        model: "gateway/gemini-2.5-pro",
        createdAt: "2026-07-20T09:15:00.000Z",
        markdown: [
          "### Beers 1874 atlas, Cornwall sheet",
          "",
          "The ridge above the reservoir is drawn as three parcels: **J. Pratt**, **E. Calhoun**, and school lot 9. Your wall lines up with the Pratt–Calhoun boundary almost exactly.",
          "",
          "- Pratt's farmhouse is marked ~400 m northeast of the lookout clearing — a cellar hole may survive there.",
          "- The atlas shows no road along the wall, so it was a *division* wall, matching the single-stack style.",
        ].join("\n"),
        sources: [
          { title: "Beers Atlas 1874 — Cornwall (UConn MAGIC scan)", url: "https://magic.lib.uconn.edu/", note: "parcel names" },
        ],
        research: [
          { tool: "exa", action: "Searched", detail: "Beers atlas 1874 Cornwall Connecticut scan — 3 results" },
          { tool: "firecrawl", action: "Read", detail: "magic.lib.uconn.edu atlas index" },
        ],
        followUps: ["Locate the Pratt cellar hole northeast of the lookout"],
      },
    },
  ],
};

export function statusLabel(status: ProtoStatus): string {
  switch (status) {
    case "saved_locally":
      return "Saved locally";
    case "syncing":
      return "Syncing";
    case "enriching":
      return "Enriching";
    case "complete":
      return "Complete";
    case "needs_attention":
      return "Needs attention";
  }
}

export function allPhotos(thread: ProtoThread): Array<ProtoPhoto & { captureId: string }> {
  return thread.captures.flatMap((capture) =>
    capture.photos.map((photo) => ({ ...photo, captureId: capture.id })),
  );
}

export function openFollowUps(
  thread: ProtoThread,
): Array<{ captureId: string; sequence: number; text: string }> {
  return thread.captures.flatMap((capture) =>
    (capture.enrichment?.followUps ?? []).map((text) => ({
      captureId: capture.id,
      sequence: capture.sequence,
      text,
    })),
  );
}

export function reviewStats(thread: ProtoThread) {
  const photos = allPhotos(thread).length;
  const annotated = thread.captures.filter((capture) => capture.enrichment).length;
  const pending = thread.captures.filter(
    (capture) => !capture.enrichment && !capture.isFollowUp,
  ).length;
  return {
    captures: thread.captures.length,
    photos,
    annotated,
    pending,
    followUps: openFollowUps(thread).length,
  };
}

export function timeOf(iso: string): string {
  const date = new Date(iso);
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}
