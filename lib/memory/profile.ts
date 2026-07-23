import type { WalkerMemory } from "./types";

/** Keeps the profile block bounded even after many interviews. */
export const PROFILE_MEMORY_LIMIT = 40;

/**
 * Renders Memories as the walker-profile block injected into Enrichment
 * prompts. Returns null when nothing is known so prompts stay unchanged for
 * walkers who never interviewed.
 */
export function renderWalkerProfile(
  memories: WalkerMemory[],
): string | null {
  if (memories.length === 0) return null;
  const lines = memories
    .slice(0, PROFILE_MEMORY_LIMIT)
    .map((memory) => `- (${memory.category}) ${memory.content}`);
  return [
    "Walker profile — durable Memories the walker shared in interviews.",
    "Tailor the report to them: skip basics they already know, go deeper on their interests, and connect findings to their usual terrain. Never repeat the profile back.",
    ...lines,
  ].join("\n");
}
