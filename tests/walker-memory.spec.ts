import { expect, test } from "@playwright/test";
import {
  createMemoryWalkerMemoryRepository,
  resetMemoryWalkerMemoryRepository,
} from "@/lib/memory/memory-repository";
import { applyMemoryPatch } from "@/lib/memory/patches";
import { PROFILE_MEMORY_LIMIT, renderWalkerProfile } from "@/lib/memory/profile";
import type { WalkerMemory } from "@/lib/memory/types";

const NS = "walker-memory-tests";

let idCounter = 0;
const clock = {
  now: () => `2026-07-23T10:00:${String(idCounter % 60).padStart(2, "0")}.000Z`,
  createId: () => `id-${++idCounter}`,
};

test.beforeEach(() => {
  resetMemoryWalkerMemoryRepository(NS);
  idCounter = 0;
});

function memory(overrides: Partial<WalkerMemory> = {}): WalkerMemory {
  return {
    id: "mem-1",
    category: "interest",
    content: "Fascinated by owls and other raptors",
    source: "interview",
    sourceId: "turn-1",
    createdAt: "2026-07-20T10:00:00.000Z",
    ...overrides,
  };
}

test("patches materialize per user and never cross users", async () => {
  const repository = createMemoryWalkerMemoryRepository(NS);
  await applyMemoryPatch(
    repository,
    "user_a",
    { op: "add", category: "interest", content: "Loves owls", source: "interview" },
    clock,
  );
  await applyMemoryPatch(
    repository,
    "user_b",
    { op: "add", category: "place", content: "Walks in Vermont", source: "interview" },
    clock,
  );

  const forA = await repository.listMemories("user_a");
  const forB = await repository.listMemories("user_b");
  expect(forA.map((entry) => entry.content)).toEqual(["Loves owls"]);
  expect(forB.map((entry) => entry.content)).toEqual(["Walks in Vermont"]);
  expect(await repository.listPatches("user_a")).toHaveLength(1);
});

test("renderWalkerProfile is null with no Memories so prompts stay unchanged", () => {
  expect(renderWalkerProfile([])).toBeNull();
});

test("renderWalkerProfile lists each Memory with its id and category", () => {
  const profile = renderWalkerProfile([
    memory(),
    memory({
      id: "mem-2",
      category: "place",
      content: "Walks the ridgeline trails around Portland, Oregon",
    }),
  ]);
  expect(profile).toContain("Walker profile");
  expect(profile).toContain(
    "- [mem-1] (interest) Fascinated by owls and other raptors",
  );
  expect(profile).toContain(
    "- [mem-2] (place) Walks the ridgeline trails around Portland, Oregon",
  );
  expect(profile).toContain("Never repeat the profile back");
  expect(profile).toContain("memory_patch");
});

test("renderWalkerProfile caps the block after many interviews", () => {
  const many = Array.from({ length: PROFILE_MEMORY_LIMIT + 10 }, (_, index) =>
    memory({ id: `mem-${index}`, content: `Fact number ${index}` }),
  );
  const profile = renderWalkerProfile(many);
  const lines = (profile ?? "").split("\n").filter((line) => line.startsWith("- ["));
  expect(lines).toHaveLength(PROFILE_MEMORY_LIMIT);
});
