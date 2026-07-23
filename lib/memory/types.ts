export const MEMORY_CATEGORIES = [
  "identity",
  "place",
  "interest",
  "expertise",
  "preference",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export function isMemoryCategory(value: string): value is MemoryCategory {
  return (MEMORY_CATEGORIES as readonly string[]).includes(value);
}

export type MemorySource = "interview" | "manual";

/**
 * A Memory: one durable fact about the walker (who they are, where they walk,
 * what they know, what draws their attention) that tailors future Enrichments.
 */
export type WalkerMemory = {
  id: string;
  category: MemoryCategory;
  content: string;
  source: MemorySource;
  /** Interview turn (or other record) this Memory was learned from. */
  sourceId: string | null;
  createdAt: string;
};

export type WalkerMemoryInput = {
  id: string;
  category: MemoryCategory;
  content: string;
  source: MemorySource;
  sourceId?: string | null;
  createdAt: string;
};

export type WalkerMemoryRepository = {
  listMemories(userId: string): Promise<WalkerMemory[]>;
  saveMemory(userId: string, memory: WalkerMemoryInput): Promise<WalkerMemory>;
  /** Returns true when a Memory existed and was removed. */
  forgetMemory(userId: string, memoryId: string): Promise<boolean>;
};
