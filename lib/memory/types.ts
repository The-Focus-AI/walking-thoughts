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

export type MemoryPatchOp = "add" | "update" | "remove";

export type MemoryPatchSource = "interview" | "enrichment" | "manual";

/**
 * One entry in the append-only Memory Patch log — the primary record of what
 * the system believes about the walker. The current Memory set is the log's
 * materialization; nothing is ever hard-deleted.
 */
export type MemoryPatch = {
  id: string;
  op: MemoryPatchOp;
  memoryId: string;
  category: MemoryCategory;
  /** Content before the patch; null for add. */
  before: string | null;
  /** Content after the patch; null for remove. */
  after: string | null;
  source: MemoryPatchSource;
  /** Interview turn id, Thread id (enrichment), or reverted patch id. */
  sourceId: string | null;
  /** Set when this patch is the inverse of an earlier one. */
  revertsPatchId: string | null;
  createdAt: string;
};

/**
 * A Memory: one durable fact about the walker, materialized from the patch
 * log and injected into every Enrichment as the walker profile.
 */
export type WalkerMemory = {
  id: string;
  category: MemoryCategory;
  content: string;
  /** Source of the patch that created this Memory. */
  source: MemoryPatchSource;
  sourceId: string | null;
  createdAt: string;
};

export type WalkerMemoryRepository = {
  /** Current Memory set — the patch log materialized. */
  listMemories(userId: string): Promise<WalkerMemory[]>;
  /** Full patch history in creation order. */
  listPatches(userId: string): Promise<MemoryPatch[]>;
  appendPatch(userId: string, patch: MemoryPatch): Promise<MemoryPatch>;
};
