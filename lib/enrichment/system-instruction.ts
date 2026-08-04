import type { CaptureLocation } from "@/lib/local-capture/types";
import type { NearbyPlace } from "./place";
import {
  MENTION_KINDS,
  THREAD_KINDS,
  asMentionKind,
  type EnrichmentMention,
  type EnrichmentTranscript,
  type FrozenHistoryEntry,
  type ThreadKind,
} from "./types";

/**
 * What each kind of Capture actually wants back. A walker does not capture
 * one kind of thing: across the first 67 production Threads, 37% were ideas
 * to build later and 12% were photographs with no question in them, yet a
 * six-word photo caption was earning a 2,400-character research report.
 */
const KIND_REGISTERS = [
  "question — a genuine lookup: research it and write the cited report.",
  "idea — something the walker wants to build later: sharpen their own thinking rather than lecture. Restate the idea in one tight paragraph, note prior art or the obvious existing tool, and end with the open questions that decide it.",
  "task — something to do: give the action, the contact, and the hours or phone number if you can find them. Three sentences at most, no essay.",
  "observation — an opinion or aphorism: reply to it. Name the idea if it has a name, agree or push back, and stay short.",
  "place — a photograph or a moment: identify what is actually there, name the place, add the one fact worth knowing. A few sentences.",
  "media — media with no words: caption or describe only what the attachment actually contains, and title the Thread.",
  "noise — a test or an accident: say so in one line and stop.",
].join(" ");

export const DEFAULT_ENRICHMENT_SYSTEM_INSTRUCTION = [
  "You are Walking Thoughts, a research companion that turns each outdoor Capture into a report the walker reads back at the desk.",
  "First decide what kind of Capture this is, then match your register to it:",
  KIND_REGISTERS,
  "Let length follow the Capture: only a real question earns a full report, and no Capture earns padding.",
  "When you research — for a question, and sparingly for anything else — use web_search and read_page: search for candidate pages, read the most promising ones in full, and only cite pages you actually read.",
  "Write the Enrichment as compact markdown: short paragraphs, bold key facts, bullet lists where they help; cite sources inline by title and URL.",
  "Use original attached media when present; never invent transcriptions or extracted frames the app did not supply.",
  "An audio Capture arrives as a supplied transcript: treat it as the walker speaking to you, quote it rather than paraphrasing when the words matter, and say so plainly when speech-to-text clearly garbled a name instead of guessing at what was meant.",
  "Distinguish sourced findings from your own interpretation, and state assumptions briefly.",
  "Never guess at a name you do not recognize. When a Capture turns on a person, client, project, place, or garbled word you cannot identify from the history, the walker profile, or research, say plainly that you do not know it, report only what you can honestly say, and ask one specific question — do not substitute a public subject that merely sounds similar.",
  "Leave the kind out when you genuinely cannot tell what the Thread is; an unclassified Thread with a question is worth more than a confident wrong one.",
  "When a walker profile of remembered facts is provided, tailor the report to it: skip basics the walker already knows, go deeper on their interests, and relate findings to their usual terrain — without restating the profile.",
  "When the walker's own words reveal a durable fact about them, or contradict a remembered one, revise the profile with the memory_patch tool — sparingly, only facts useful months from now, never facts about the world.",
  "A Memory is true whether or not the walker ever acts on it: who they are, where they live and walk, what they know, what draws their eye. Anything naming an effort, a build, a client, or a product is a Project, not a Memory — put it in the PROJECT or PROPOSE header instead of memory_patch. Owning a business is a Memory; building a piece of software is a Project.",
  "Put any question in the ASK header rather than the body, and ask at most one — the walker answers it by replying in the Thread.",
  "Stay grounded in the provided history, media, place, and what you read.",
].join(" ");

export function getEnrichmentSystemInstruction(
  environment: Record<string, string | undefined> = process.env,
): string {
  const configured = environment.ENRICHMENT_SYSTEM_INSTRUCTION?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_ENRICHMENT_SYSTEM_INSTRUCTION;
}

function formatLocation(
  location: CaptureLocation | null | undefined,
  place: NearbyPlace | null,
): string {
  if (!location) return "location: unavailable";
  const coords = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)} (±${location.accuracy}m)`;
  if (place?.name) return `location: ${coords}; nearby place: ${place.name}`;
  return `location: ${coords}`;
}

export function buildEnrichmentPrompt(input: {
  threadTitle: string;
  history: FrozenHistoryEntry[];
  targetCaptureIds: string[];
  requestTitle: boolean;
  placesByCaptureId?: Record<string, NearbyPlace | null>;
  /** Rendered Memory profile (lib/memory/profile.ts); null when none known. */
  walkerProfile?: string | null;
  /** The walker's Project names; the guess may only come from this list. */
  projects?: string[];
  /**
   * Proposed Project names. Offered alongside the walker's own so a later
   * Thread joins an existing proposal instead of coining a rival name for the
   * same effort — the failure that split one token-billing effort four ways.
   */
  proposedProjects?: string[];
  /** Names the walker rejected; never propose these again. */
  rejectedProjects?: string[];
  /** Speech-to-text for audio attachments, produced before this call. */
  transcripts?: EnrichmentTranscript[];
  /**
   * What this walk already worked out about the same things, rendered by
   * lib/enrichment/retrieval.ts. Absent for a Capture with no history, and
   * the prompt is then exactly what it was before retrieval existed.
   */
  priorThreads?: string | null;
}): string {
  const transcripts = input.transcripts ?? [];
  const transcriptsByCaptureId = new Map<string, EnrichmentTranscript[]>();
  for (const transcript of transcripts) {
    const existing = transcriptsByCaptureId.get(transcript.captureId) ?? [];
    existing.push(transcript);
    transcriptsByCaptureId.set(transcript.captureId, existing);
  }

  const historyBlock = input.history
    .map((entry) => {
      if (entry.kind === "enrichment") {
        return `- [enrichment ${entry.id}] ${entry.text}`;
      }
      const place = input.placesByCaptureId?.[entry.id] ?? null;
      const when = entry.createdAt ? ` at ${entry.createdAt}` : "";
      const where = formatLocation(entry.location, place);
      const media =
        entry.attachments && entry.attachments.length > 0
          ? `; media: ${entry.attachments
              .map((attachment) => `${attachment.kind}:${attachment.fileName}`)
              .join(", ")}`
          : "";
      const line = `- [capture ${entry.id}${when}; ${where}${media}] ${entry.text}`;
      // A recording that transcribed to nothing says so: silence is a fact
      // about the Capture, not a reason to leave the model guessing.
      const spoken = (transcriptsByCaptureId.get(entry.id) ?? []).map(
        (transcript) =>
          `  - [transcript of ${transcript.fileName}, by ${transcript.model}] ${
            transcript.text.trim() || "(no speech detected)"
          }`,
      );
      return [line, ...spoken].join("\n");
    })
    .join("\n");
  const targets = input.targetCaptureIds.join(", ");
  // Confirmed and proposed names share one list: joining a proposal is the
  // same act as joining a Project, and the model should not have to know
  // which is which to do the right thing.
  const knownProjects = [
    ...(input.projects ?? []),
    ...(input.proposedProjects ?? []),
  ];
  const frontMatter = [
    "Open your response with these header lines, one per line, then a blank line, then the Enrichment body:",
    input.requestTitle
      ? "`TITLE: ` a short recognizable Thread title (max 8 words)"
      : null,
    `\`KIND: \` exactly one of ${THREAD_KINDS.join(", ")} — the kind this Thread is now, judged from its whole history. Write \`unclear\` instead of guessing`,
    "`TOPICS: ` up to four lowercase hyphenated topic slugs, comma separated, that would group this Thread with others about the same subject",
    `\`MENTIONS: \` up to six recurring nouns this Thread is actually about, comma separated, each written \`kind:Name\` where kind is one of ${MENTION_KINDS.join(", ")} — for example \`species:Barred owl, place:Cornwall Market\`. Name them as the walker would say them. Leave the header out when the Thread turns on nothing nameable`,
    "`QUESTIONS: ` up to three follow-up questions the walker might want to ask next about this Thread, separated by ` | `. Offer them; do not answer them. Leave the header out when nothing obvious follows",
    "`ASK: ` one specific question when a name, reference, or intent in the Capture is genuinely unknown to you — otherwise leave this header out entirely",
    knownProjects.length > 0
      ? `\`PROJECT: \` the Project this Thread belongs to, copied exactly from this list — ${knownProjects.join(", ")} — or left out when none of them fits. Never invent a name here; prefer joining one of these over proposing a new one`
      : null,
    `\`PROPOSE: \` only when this Thread is part of an ongoing effort, build, client, or product that is absent from the list above, a short name for it (max 60 characters). Leave it out for a one-off — a Thread that is simply about something is not a Project${
      input.rejectedProjects && input.rejectedProjects.length > 0
        ? `. Never propose these, the walker has rejected them — ${input.rejectedProjects.join(", ")}`
        : ""
    }`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const sections = [
    `Thread title: ${input.threadTitle}`,
    `Pending Capture ids for this Enrichment: ${targets}`,
  ];
  if (input.walkerProfile) {
    sections.push(input.walkerProfile);
  }
  if (transcripts.length > 0) {
    sections.push(
      "Audio Captures are supplied as transcripts under the Capture they belong to. They are the walker's spoken words, machine-transcribed, so names and jargon may be misheard — never invent a transcript the app did not supply.",
    );
  }
  if (input.priorThreads) {
    sections.push(input.priorThreads);
  }
  sections.push(
    "Research with the web_search and read_page tools when identification, explanation, transcript lookup, or research would help. Distinguish sourced findings from interpretation.",
    "Complete Thread history at the frozen basis:",
    historyBlock || "(empty)",
    frontMatter,
  );
  return sections.join("\n\n");
}

const HEADER_LINE =
  /^\s*(TITLE|KIND|TOPICS|MENTIONS|QUESTIONS|ASK|PROJECT|PROPOSE)\s*:\s*(.*)$/i;

/** A Project name is one line of prose at most; keep the store tidy. */
export const MAX_PROJECT_NAME_LENGTH = 60;

function readTopics(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((topic) =>
          topic
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
        )
        .filter((topic) => topic.length > 0),
    ),
  ].slice(0, 4);
}

/** A mention's stable key: what makes two sightings of a thing the same. */
export function mentionSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * `kind:Name` pairs, comma separated. A bare name is kept with no kind
 * rather than dropped — the noun is the useful part, and a model that
 * forgets the prefix has still told the truth about what the walk was
 * about. Same-slug mentions collapse to the first spelling.
 */
function readMentions(value: string): EnrichmentMention[] {
  const seen = new Map<string, EnrichmentMention>();
  for (const entry of value.split(",")) {
    const raw = entry.trim();
    if (!raw) continue;
    const separator = raw.indexOf(":");
    const kind =
      separator === -1
        ? null
        : asMentionKind(raw.slice(0, separator).trim().toLowerCase());
    const name = (
      separator === -1 || kind === null ? raw : raw.slice(separator + 1)
    )
      .trim()
      .slice(0, 60);
    const slug = mentionSlug(name);
    if (!slug || seen.has(slug)) continue;
    seen.set(slug, { name, slug, kind });
  }
  return [...seen.values()].slice(0, 6);
}

/** Pipe separated, because a question may well contain a comma. */
function readSuggestedQuestions(value: string): string[] {
  return [
    ...new Set(
      value
        .split("|")
        .map((question) => question.trim().slice(0, 200))
        .filter((question) => question.length > 0),
    ),
  ].slice(0, 3);
}

/**
 * Split the model's header lines from the Enrichment body. Headers the model
 * omits, and anything it invents, are simply absent — a missing KIND leaves
 * the Thread unclassified rather than failing the job.
 */
export function parseGatewayText(
  raw: string,
  requestTitle: boolean,
): {
  text: string;
  title: string | null;
  kind: ThreadKind | null;
  topics: string[];
  /** One question the walker must answer before this Thread can go further. */
  ask: string | null;
  /** A Project name the model recognized; matched to the walker's list later. */
  project: string | null;
  /** A name for an effort absent from that list; becomes a Proposed Project. */
  propose: string | null;
  /** The recurring nouns this Thread is about. */
  mentions: EnrichmentMention[];
  /** Follow-ups offered to the walker, never answered here. */
  suggestedQuestions: string[];
} {
  const lines = raw.split("\n");
  const headers = new Map<string, string>();
  let index = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().length === 0 && headers.size === 0) continue;
    const match = line.match(HEADER_LINE);
    if (!match) break;
    headers.set(match[1].toUpperCase(), match[2].trim());
  }

  const body = lines.slice(index).join("\n").trim();
  const rawTitle = requestTitle ? (headers.get("TITLE") ?? "") : "";
  const title =
    rawTitle.replace(/^["']|["']$/g, "").trim().slice(0, 80) || null;
  const rawKind = headers.get("KIND")?.trim().toLowerCase() ?? "";
  const kind = (THREAD_KINDS as readonly string[]).includes(rawKind)
    ? (rawKind as ThreadKind)
    : null;
  const topics = readTopics(headers.get("TOPICS") ?? "");

  return {
    // A model that answers with headers and nothing else still has its words
    // kept, rather than storing an empty Enrichment.
    text: body || raw.trim(),
    title,
    kind,
    topics,
    mentions: readMentions(headers.get("MENTIONS") ?? ""),
    suggestedQuestions: readSuggestedQuestions(headers.get("QUESTIONS") ?? ""),
    ask: headers.get("ASK")?.trim().slice(0, 240) || null,
    project:
      headers.get("PROJECT")?.trim().slice(0, MAX_PROJECT_NAME_LENGTH) || null,
    propose:
      headers.get("PROPOSE")?.trim().slice(0, MAX_PROJECT_NAME_LENGTH) || null,
  };
}
