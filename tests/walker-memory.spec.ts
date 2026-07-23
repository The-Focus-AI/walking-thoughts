import { expect, test } from "@playwright/test";
import {
  createMemoryWalkerMemoryRepository,
  resetMemoryWalkerMemoryRepository,
} from "@/lib/memory/memory-repository";
import { PROFILE_MEMORY_LIMIT, renderWalkerProfile } from "@/lib/memory/profile";
import type { WalkerMemory } from "@/lib/memory/types";

const NS = "walker-memory-tests";

test.beforeEach(() => {
  resetMemoryWalkerMemoryRepository(NS);
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

test("saves, lists in creation order, and forgets Memories per user", async () => {
  const repository = createMemoryWalkerMemoryRepository(NS);

  await repository.saveMemory("user_a", {
    ...memory({ id: "mem-2", createdAt: "2026-07-21T10:00:00.000Z" }),
  });
  await repository.saveMemory("user_a", memory());
  await repository.saveMemory("user_b", memory({ id: "mem-other" }));

  const listed = await repository.listMemories("user_a");
  expect(listed.map((entry) => entry.id)).toEqual(["mem-1", "mem-2"]);

  expect(await repository.forgetMemory("user_a", "mem-1")).toBe(true);
  expect(await repository.forgetMemory("user_a", "mem-1")).toBe(false);
  expect(await repository.listMemories("user_a")).toHaveLength(1);
  // Forgetting never crosses users.
  expect(await repository.listMemories("user_b")).toHaveLength(1);
});

test("renderWalkerProfile is null with no Memories so prompts stay unchanged", () => {
  expect(renderWalkerProfile([])).toBeNull();
});

test("renderWalkerProfile lists each Memory with its category", () => {
  const profile = renderWalkerProfile([
    memory(),
    memory({
      id: "mem-2",
      category: "place",
      content: "Walks the ridgeline trails around Portland, Oregon",
    }),
  ]);
  expect(profile).toContain("Walker profile");
  expect(profile).toContain("- (interest) Fascinated by owls and other raptors");
  expect(profile).toContain(
    "- (place) Walks the ridgeline trails around Portland, Oregon",
  );
  expect(profile).toContain("Never repeat the profile back");
});

test("renderWalkerProfile caps the block after many interviews", () => {
  const many = Array.from({ length: PROFILE_MEMORY_LIMIT + 10 }, (_, index) =>
    memory({ id: `mem-${index}`, content: `Fact number ${index}` }),
  );
  const profile = renderWalkerProfile(many);
  const lines = (profile ?? "").split("\n").filter((line) => line.startsWith("- ("));
  expect(lines).toHaveLength(PROFILE_MEMORY_LIMIT);
});
