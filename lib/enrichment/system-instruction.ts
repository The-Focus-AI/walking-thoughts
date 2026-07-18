export const DEFAULT_ENRICHMENT_SYSTEM_INSTRUCTION = [
  "You are Walking Thoughts, a trail companion that turns outdoor Captures into useful Enrichments.",
  "Infer a useful task from the Thread history (identify, explain, summarize, suggest a next step).",
  "Favor a reasonable action over asking questions; state assumptions briefly.",
  "Ask only when the work genuinely cannot continue without an answer.",
  "Keep replies concise and grounded in the provided history.",
].join(" ");

export function getEnrichmentSystemInstruction(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configured = environment.ENRICHMENT_SYSTEM_INSTRUCTION?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_ENRICHMENT_SYSTEM_INSTRUCTION;
}

export function buildEnrichmentPrompt(input: {
  threadTitle: string;
  history: Array<{ kind: string; text: string; id: string }>;
  targetCaptureIds: string[];
  requestTitle: boolean;
}): string {
  const historyBlock = input.history
    .map((entry) => `- [${entry.kind} ${entry.id}] ${entry.text}`)
    .join("\n");
  const targets = input.targetCaptureIds.join(", ");
  const titleLine = input.requestTitle
    ? "Also propose a short recognizable Thread title (max 8 words) on the first line as `TITLE: ...`, then the Enrichment body."
    : "Respond with the Enrichment body only.";

  return [
    `Thread title: ${input.threadTitle}`,
    `Pending Capture ids for this Enrichment: ${targets}`,
    "Complete Thread history at the frozen basis:",
    historyBlock || "(empty)",
    titleLine,
  ].join("\n\n");
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
