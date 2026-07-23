import type { GatewayClient } from "@/lib/enrichment/types";
import {
  isMemoryCategory,
  type MemoryCategory,
  type WalkerMemory,
} from "@/lib/memory/types";

export type ExtractedMemory = {
  category: MemoryCategory;
  content: string;
};

/** An answer yields at most this many Memories. */
export const MAX_MEMORIES_PER_ANSWER = 5;
export const MAX_MEMORY_CONTENT_LENGTH = 300;

const EXTRACTION_SYSTEM = [
  "You distill one interview answer from a walker into durable, reusable facts for tailoring their future trail research reports.",
  "Output one line per fact in the form `MEMORY[category]: fact`, where category is one of identity, place, interest, expertise, preference.",
  "Each fact must be a self-contained third-person statement about the walker, useful months from now.",
  "Skip anything transient, redundant with the already-remembered facts, or not actually about the walker.",
  "If the answer contains nothing durable, respond with the single word NONE.",
].join(" ");

export function parseMemoryLines(raw: string): ExtractedMemory[] {
  const extracted: ExtractedMemory[] = [];
  const pattern = /MEMORY\[([a-z]+)\]:\s*(.+)/gi;
  for (const match of raw.matchAll(pattern)) {
    const category = match[1].toLowerCase();
    const content = match[2].trim().slice(0, MAX_MEMORY_CONTENT_LENGTH);
    if (!isMemoryCategory(category) || content.length === 0) continue;
    extracted.push({ category, content });
    if (extracted.length >= MAX_MEMORIES_PER_ANSWER) break;
  }
  return extracted;
}

/**
 * Turns one Interview answer into Memories via the gateway model. When the
 * model yields no MEMORY lines (including the fake dev gateway), the raw
 * answer is kept whole under the question's category so nothing the walker
 * said is lost.
 */
export async function extractMemoriesFromAnswer(input: {
  question: string;
  category: MemoryCategory;
  answer: string;
  existingMemories: WalkerMemory[];
  gateway: GatewayClient;
  model: string;
}): Promise<ExtractedMemory[]> {
  const answer = input.answer.trim();
  if (answer.length === 0) return [];

  const known =
    input.existingMemories.length === 0
      ? "(nothing yet)"
      : input.existingMemories
          .map((memory) => `- (${memory.category}) ${memory.content}`)
          .join("\n");
  const prompt = [
    "Already-remembered facts about this walker:",
    known,
    `Interview question: ${input.question}`,
    `Walker's answer: ${answer}`,
    "Extract the durable facts, or reply NONE.",
  ].join("\n\n");

  let raw = "";
  try {
    const generation = await input.gateway.generate({
      model: input.model,
      system: EXTRACTION_SYSTEM,
      prompt,
      requestTitle: false,
      media: [],
    });
    raw = generation.text;
  } catch {
    raw = "";
  }

  const extracted = parseMemoryLines(raw);
  if (extracted.length > 0) return extracted;
  if (/^\s*NONE\s*$/i.test(raw)) return [];
  return [
    {
      category: input.category,
      content: answer.slice(0, MAX_MEMORY_CONTENT_LENGTH),
    },
  ];
}
