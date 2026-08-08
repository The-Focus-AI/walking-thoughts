import type { DayCorpusEntry, DayDigestRequest } from "./types";

export const DAY_DIGEST_SYSTEM_INSTRUCTION = [
  "You are Walking Thoughts, digesting one walker's entire day across every Thread.",
  "The walker may ask for a checklist, a summary, follow-ups, or any synthesis of the day's Captures and Enrichments.",
  "Answer only from the material provided — do not invent Captures or findings.",
  "When asked for a checklist or tasks and a routed to-dos section is provided, that section IS the checklist: list each routed to-do in the walker's own words (- [ ] open, - [x] done) and do not derive, add, or rephrase tasks; if it says none were routed, say the walker has not put anything on the list yet.",
  "Only when no routed to-dos section is provided, return a markdown checklist (- [ ] …) of concrete next actions grounded in the day's reports.",
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
  const sections = [`Day: ${input.dayHeading} (${input.dayKey})`];
  if (input.history?.length) {
    sections.push(
      "Conversation so far (oldest first) — continue it, don't restart:",
      input.history
        .map(
          (turn) =>
            `${turn.role === "walker" ? "Walker" : "Digest"}: ${turn.text}`,
        )
        .join("\n"),
    );
  }
  sections.push(`Walker's ask: ${input.question}`);
  if (input.walkerProfile) {
    sections.push(input.walkerProfile);
  }
  // The walker's own list, when the caller knows it: the checklist comes
  // from what they routed to To-do, never re-derived from the corpus.
  if (input.routedTodos) {
    const lines = input.routedTodos.map(
      (todo) =>
        `- [${todo.done ? "x" : " "}] [thread ${todo.threadId}] ${todo.text}`,
    );
    sections.push(
      "Routed to-dos for this day (the walker's task list — the checklist comes from these, verbatim):",
      lines.join("\n") || "(none routed yet)",
    );
  }
  sections.push(
    "Complete day corpus across every Thread:",
    historyBlock || "(empty)",
    "Respond with the digest body only.",
  );
  return sections.join("\n\n");
}
