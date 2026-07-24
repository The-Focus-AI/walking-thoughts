import { expect, test } from "@playwright/test";
import {
  createMemoryWalkerMemoryRepository,
  resetMemoryWalkerMemoryRepository,
} from "@/lib/memory/memory-repository";
import {
  applyMemoryPatch,
  materializeMemories,
  revertMemoryPatch,
  revertedPatchIds,
} from "@/lib/memory/patches";
import type { WalkerMemoryRepository } from "@/lib/memory/types";

const NS = "memory-patches-tests";

let idCounter = 0;
const clock = {
  now: () => `2026-07-23T10:00:${String(idCounter).padStart(2, "0")}.000Z`,
  createId: () => `id-${++idCounter}`,
};

test.beforeEach(() => {
  resetMemoryWalkerMemoryRepository(NS);
  idCounter = 0;
});

async function add(
  repository: WalkerMemoryRepository,
  content: string,
  category = "interest",
) {
  const result = await applyMemoryPatch(
    repository,
    "user_a",
    { op: "add", category, content, source: "interview", sourceId: "turn-1" },
    clock,
  );
  if (!result.ok) throw new Error(result.error);
  return result.patch;
}

test("add, update, and remove materialize in order; the log keeps everything", async () => {
  const repository = createMemoryWalkerMemoryRepository(NS);
  const added = await add(repository, "Loves owls");

  const updated = await applyMemoryPatch(
    repository,
    "user_a",
    {
      op: "update",
      memoryId: added.memoryId,
      content: "Loves owls, especially barred owls",
      source: "enrichment",
      sourceId: "thread-1",
    },
    clock,
  );
  expect(updated.ok).toBe(true);
  if (updated.ok) expect(updated.patch.before).toBe("Loves owls");

  let memories = await repository.listMemories("user_a");
  expect(memories).toHaveLength(1);
  expect(memories[0].content).toBe("Loves owls, especially barred owls");
  // Materialized source stays the creating patch's source.
  expect(memories[0].source).toBe("interview");

  const removed = await applyMemoryPatch(
    repository,
    "user_a",
    { op: "remove", memoryId: added.memoryId, source: "manual" },
    clock,
  );
  expect(removed.ok).toBe(true);
  memories = await repository.listMemories("user_a");
  expect(memories).toHaveLength(0);
  expect(await repository.listPatches("user_a")).toHaveLength(3);
});

test("update and remove reject unknown Memories; add rejects junk", async () => {
  const repository = createMemoryWalkerMemoryRepository(NS);
  const missing = await applyMemoryPatch(
    repository,
    "user_a",
    { op: "update", memoryId: "nope", content: "x", source: "manual" },
    clock,
  );
  expect(missing).toEqual({ ok: false, error: "memory_not_found" });

  const badCategory = await applyMemoryPatch(
    repository,
    "user_a",
    { op: "add", category: "vibe", content: "x", source: "manual" },
    clock,
  );
  expect(badCategory).toEqual({ ok: false, error: "unknown_category" });

  const empty = await applyMemoryPatch(
    repository,
    "user_a",
    { op: "add", category: "interest", content: "   ", source: "manual" },
    clock,
  );
  expect(empty).toEqual({ ok: false, error: "content_required" });
});

test("revert(remove) restores the Memory; revert(add) removes it; revert(update) restores prior content", async () => {
  const repository = createMemoryWalkerMemoryRepository(NS);
  const added = await add(repository, "Loves owls");

  const removed = await applyMemoryPatch(
    repository,
    "user_a",
    { op: "remove", memoryId: added.memoryId, source: "enrichment" },
    clock,
  );
  if (!removed.ok) throw new Error("remove failed");
  const restore = await revertMemoryPatch(
    repository,
    "user_a",
    removed.patch.id,
    clock,
  );
  expect(restore.ok).toBe(true);
  let memories = await repository.listMemories("user_a");
  expect(memories[0]?.content).toBe("Loves owls");

  const updated = await applyMemoryPatch(
    repository,
    "user_a",
    {
      op: "update",
      memoryId: added.memoryId,
      content: "Loves hawks",
      source: "enrichment",
    },
    clock,
  );
  if (!updated.ok) throw new Error("update failed");
  const undoUpdate = await revertMemoryPatch(
    repository,
    "user_a",
    updated.patch.id,
    clock,
  );
  expect(undoUpdate.ok).toBe(true);
  memories = await repository.listMemories("user_a");
  expect(memories[0]?.content).toBe("Loves owls");

  const undoAdd = await revertMemoryPatch(
    repository,
    "user_a",
    added.id,
    clock,
  );
  expect(undoAdd.ok).toBe(true);
  memories = await repository.listMemories("user_a");
  expect(memories).toHaveLength(0);
});

test("a patch can only be reverted once, and reverts are marked in the log", async () => {
  const repository = createMemoryWalkerMemoryRepository(NS);
  const added = await add(repository, "Loves owls");

  const first = await revertMemoryPatch(repository, "user_a", added.id, clock);
  expect(first.ok).toBe(true);
  const second = await revertMemoryPatch(repository, "user_a", added.id, clock);
  expect(second).toEqual({ ok: false, error: "already_reverted" });

  const patches = await repository.listPatches("user_a");
  expect(revertedPatchIds(patches).has(added.id)).toBe(true);
});

test("materializeMemories ignores malformed sequences instead of throwing", () => {
  const memories = materializeMemories([
    {
      id: "p1",
      op: "update",
      memoryId: "ghost",
      category: "interest",
      before: null,
      after: "orphan update",
      source: "manual",
      sourceId: null,
      revertsPatchId: null,
      createdAt: "2026-07-23T10:00:00.000Z",
    },
    {
      id: "p2",
      op: "remove",
      memoryId: "ghost",
      category: "interest",
      before: "x",
      after: null,
      source: "manual",
      sourceId: null,
      revertsPatchId: null,
      createdAt: "2026-07-23T10:00:01.000Z",
    },
  ]);
  expect(memories).toHaveLength(0);
});
