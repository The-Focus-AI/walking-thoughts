import {
  isMemoryCategory,
  type MemoryPatch,
  type MemoryPatchSource,
  type WalkerMemory,
  type WalkerMemoryRepository,
} from "./types";

export const MAX_MEMORY_CONTENT_LENGTH = 300;

/** Replays the patch log into the current Memory set, in creation order. */
export function materializeMemories(patches: MemoryPatch[]): WalkerMemory[] {
  const memories = new Map<string, WalkerMemory>();
  for (const patch of patches) {
    if (patch.op === "add") {
      if (patch.after === null) continue;
      memories.set(patch.memoryId, {
        id: patch.memoryId,
        category: patch.category,
        content: patch.after,
        source: patch.source,
        sourceId: patch.sourceId,
        createdAt: patch.createdAt,
      });
    } else if (patch.op === "update") {
      const current = memories.get(patch.memoryId);
      if (!current || patch.after === null) continue;
      memories.set(patch.memoryId, {
        ...current,
        category: patch.category,
        content: patch.after,
      });
    } else {
      memories.delete(patch.memoryId);
    }
  }
  return [...memories.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1,
  );
}

export type MemoryPatchRequest = {
  op: string;
  memoryId?: string;
  category?: string;
  content?: string;
  source: MemoryPatchSource;
  sourceId?: string | null;
};

export type MemoryPatchResult =
  | { ok: true; patch: MemoryPatch }
  | { ok: false; error: string };

/**
 * The one write path for Memories — Interview, Enrichment's memory_patch
 * tool, and manual Forget all append through here, so the patch log is a
 * complete history. (Kept as a plain domain operation so a future MCP/A2A
 * surface can wrap it directly.)
 */
export async function applyMemoryPatch(
  repository: WalkerMemoryRepository,
  userId: string,
  request: MemoryPatchRequest,
  clock: { now: () => string; createId: () => string },
): Promise<MemoryPatchResult> {
  const current = materializeMemories(await repository.listPatches(userId));
  const content = request.content?.trim().slice(0, MAX_MEMORY_CONTENT_LENGTH);

  if (request.op === "add") {
    if (!request.category || !isMemoryCategory(request.category)) {
      return { ok: false, error: "unknown_category" };
    }
    if (!content) return { ok: false, error: "content_required" };
    const patch = await repository.appendPatch(userId, {
      id: clock.createId(),
      op: "add",
      memoryId: request.memoryId ?? clock.createId(),
      category: request.category,
      before: null,
      after: content,
      source: request.source,
      sourceId: request.sourceId ?? null,
      revertsPatchId: null,
      createdAt: clock.now(),
    });
    return { ok: true, patch };
  }

  const target = current.find((memory) => memory.id === request.memoryId);
  if (!target) return { ok: false, error: "memory_not_found" };

  if (request.op === "update") {
    if (!content) return { ok: false, error: "content_required" };
    const category =
      request.category && isMemoryCategory(request.category)
        ? request.category
        : target.category;
    const patch = await repository.appendPatch(userId, {
      id: clock.createId(),
      op: "update",
      memoryId: target.id,
      category,
      before: target.content,
      after: content,
      source: request.source,
      sourceId: request.sourceId ?? null,
      revertsPatchId: null,
      createdAt: clock.now(),
    });
    return { ok: true, patch };
  }

  if (request.op === "remove") {
    const patch = await repository.appendPatch(userId, {
      id: clock.createId(),
      op: "remove",
      memoryId: target.id,
      category: target.category,
      before: target.content,
      after: null,
      source: request.source,
      sourceId: request.sourceId ?? null,
      revertsPatchId: null,
      createdAt: clock.now(),
    });
    return { ok: true, patch };
  }

  return { ok: false, error: "unknown_op" };
}

/** Patch ids that have already been undone by a later revert. */
export function revertedPatchIds(patches: MemoryPatch[]): Set<string> {
  return new Set(
    patches
      .map((patch) => patch.revertsPatchId)
      .filter((id): id is string => id !== null),
  );
}

/**
 * Reverts one patch by appending its inverse — the log stays append-only.
 * revert(add) removes the Memory, revert(remove) restores it, revert(update)
 * restores the prior content.
 */
export async function revertMemoryPatch(
  repository: WalkerMemoryRepository,
  userId: string,
  patchId: string,
  clock: { now: () => string; createId: () => string },
): Promise<MemoryPatchResult> {
  const patches = await repository.listPatches(userId);
  const target = patches.find((patch) => patch.id === patchId);
  if (!target) return { ok: false, error: "patch_not_found" };
  if (revertedPatchIds(patches).has(patchId)) {
    return { ok: false, error: "already_reverted" };
  }

  const current = materializeMemories(patches);
  const memory = current.find((entry) => entry.id === target.memoryId);

  let inverse: Omit<MemoryPatch, "id" | "createdAt"> | null = null;
  if (target.op === "add" || target.op === "update") {
    if (!memory) return { ok: false, error: "memory_not_found" };
    inverse =
      target.op === "add"
        ? {
            op: "remove",
            memoryId: target.memoryId,
            category: memory.category,
            before: memory.content,
            after: null,
            source: "manual",
            sourceId: target.id,
            revertsPatchId: target.id,
          }
        : {
            op: "update",
            memoryId: target.memoryId,
            category: target.category,
            before: memory.content,
            after: target.before,
            source: "manual",
            sourceId: target.id,
            revertsPatchId: target.id,
          };
    if (inverse.op === "update" && inverse.after === null) {
      return { ok: false, error: "patch_not_invertible" };
    }
  } else {
    if (memory) return { ok: false, error: "memory_already_present" };
    inverse = {
      op: "add",
      memoryId: target.memoryId,
      category: target.category,
      before: null,
      after: target.before,
      source: "manual",
      sourceId: target.id,
      revertsPatchId: target.id,
    };
    if (inverse.after === null) {
      return { ok: false, error: "patch_not_invertible" };
    }
  }

  const patch = await repository.appendPatch(userId, {
    ...inverse,
    id: clock.createId(),
    createdAt: clock.now(),
  });
  return { ok: true, patch };
}
