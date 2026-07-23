import type { CaptureLocation } from "@/lib/local-capture/types";
import type { NearbyPlace } from "./place";
import type { FrozenHistoryEntry } from "./types";

export const DEFAULT_ENRICHMENT_SYSTEM_INSTRUCTION = [
  "You are Walking Thoughts, a research companion that turns each outdoor Capture into a report the walker reads back at the desk.",
  "Infer the question inside the Capture (identify, explain, place in context, look up) and research it: when web_search and read_page tools are available, search for candidate pages, read the most promising ones in full, and only cite pages you actually read.",
  "Write the Enrichment as a compact markdown report: short paragraphs, bold key facts, bullet lists where they help; cite sources inline by title and URL.",
  "Use original attached media when present; never invent transcriptions or extracted frames the app did not supply.",
  "Distinguish sourced findings from your own interpretation, and state assumptions briefly rather than asking questions.",
  "When a walker profile of remembered facts is provided, tailor the report to it: skip basics the walker already knows, go deeper on their interests, and relate findings to their usual terrain — without restating the profile.",
  "Ask only when the work genuinely cannot continue without an answer.",
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
}): string {
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
      return `- [capture ${entry.id}${when}; ${where}${media}] ${entry.text}`;
    })
    .join("\n");
  const targets = input.targetCaptureIds.join(", ");
  const titleLine = input.requestTitle
    ? "Also propose a short recognizable Thread title (max 8 words) on the first line as `TITLE: ...`, then the Enrichment body."
    : "Respond with the Enrichment body only.";

  const sections = [
    `Thread title: ${input.threadTitle}`,
    `Pending Capture ids for this Enrichment: ${targets}`,
  ];
  if (input.walkerProfile) {
    sections.push(input.walkerProfile);
  }
  sections.push(
    "Research with the web_search and read_page tools when identification, explanation, transcript lookup, or research would help. Distinguish sourced findings from interpretation.",
    "Complete Thread history at the frozen basis:",
    historyBlock || "(empty)",
    titleLine,
  );
  return sections.join("\n\n");
}

export function parseGatewayText(
  raw: string,
  requestTitle: boolean,
): { text: string; title: string | null } {
  if (!requestTitle) {
    return { text: raw.trim(), title: null };
  }
  const match = raw.match(/^\s*TITLE:\s*(.+)\s*\n([\s\S]*)$/i);
  if (!match) {
    return { text: raw.trim(), title: null };
  }
  const title = match[1].trim().replace(/^["']|["']$/g, "").slice(0, 80);
  const text = match[2].trim();
  return { text: text || raw.trim(), title: title || null };
}
