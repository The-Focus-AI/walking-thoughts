import type { WalkerMemory } from "./types";

/** Keeps the profile block bounded even after many interviews. */
export const PROFILE_MEMORY_LIMIT = 40;

/** Shown instead of the profile when the memory_patch tool is available but nothing is known yet. */
export const EMPTY_PROFILE_HINT = [
  "Walker profile: nothing is known about this walker yet.",
  "When their words reveal a durable fact about them, record it with the memory_patch tool.",
].join(" ");

/**
 * Renders Memories as the walker-profile block injected into Enrichment
 * prompts. Each line carries the Memory's id so the model can target
 * memory_patch update/remove precisely. Returns null when nothing is known
 * so prompts stay unchanged for walkers who never interviewed.
 */
export function renderWalkerProfile(
  memories: WalkerMemory[],
): string | null {
  if (memories.length === 0) return null;
  const lines = memories
    .slice(0, PROFILE_MEMORY_LIMIT)
    .map((memory) => `- [${memory.id}] (${memory.category}) ${memory.content}`);
  return [
    "Walker profile — durable Memories the walker shared or Enrichments learned.",
    "Tailor the report to them: skip basics they already know, go deeper on their interests, and connect findings to their usual terrain. Never repeat the profile back.",
    "Revise it with the memory_patch tool when the walker's words reveal something new or contradict a line below (reference the [id] for update/remove).",
    ...lines,
  ].join("\n");
}
