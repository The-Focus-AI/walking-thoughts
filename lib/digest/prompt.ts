import type { DayCorpusEntry, DayDigestRequest } from "./types";

export const DAY_DIGEST_SYSTEM_INSTRUCTION = [
  "You are Walking Thoughts, digesting one walker's entire day across every Thread.",
  "The walker may ask for a checklist, a summary, follow-ups, or any synthesis of the day's Captures and Enrichments.",
  "Answer only from the material provided — do not invent Captures or findings.",
  "When asked for a checklist or tasks, return a markdown checklist (- [ ] …) of concrete next actions grounded in the day's reports.",
  "Write compact markdown: short paragraphs, bold key facts, bullets where they help.",
  "Speak to one reader. Stay calm and factual — no cheerleading, no urgency theater.",
].join(" ");

function formatEntry(entry: DayCorpusEntry): string {
  const when = entry.createdAt ? ` at ${entry.createdAt}` : "";
  if (entry.kind === "enrichment") {
    return `- [enrichment ${entry.id}${when}; thread: ${entry.threadTitle}] ${entry.text}`;
  }
  return `- [capture ${entry.id}${when}; thread: ${entry.threadTitle}] ${entry.text}`;
}

export function buildDayDigestPrompt(input: DayDigestRequest): string {
  const historyBlock = input.corpus.map(formatEntry).join("\n");
  const sections = [
    `Day: ${input.dayHeading} (${input.dayKey})`,
    `Walker's ask: ${input.question}`,
  ];
  if (input.walkerProfile) {
    sections.push(input.walkerProfile);
  }
  sections.push(
    "Complete day corpus across every Thread:",
    historyBlock || "(empty)",
    "Respond with the digest body only.",
  );
  return sections.join("\n\n");
}
