import type {
  WalkerMemory,
  WalkerMemoryRepository,
} from "./types";

type MemoryState = {
  /** userId:memoryId -> memory */
  memories: Map<string, WalkerMemory>;
};

const states = new Map<string, MemoryState>();

function stateFor(namespace: string): MemoryState {
  const existing = states.get(namespace);
  if (existing) return existing;
  const created: MemoryState = { memories: new Map() };
  states.set(namespace, created);
  return created;
}

export function resetMemoryWalkerMemoryRepository(namespace = "default"): void {
  states.set(namespace, { memories: new Map() });
}

export function createMemoryWalkerMemoryRepository(
  namespace = "default",
): WalkerMemoryRepository {
  const state = () => stateFor(namespace);

  return {
    async listMemories(userId) {
      return [...state().memories.entries()]
        .filter(([key]) => key.startsWith(`${userId}:`))
        .map(([, memory]) => memory)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    },

    async saveMemory(userId, memory) {
      const stored: WalkerMemory = {
        id: memory.id,
        category: memory.category,
        content: memory.content,
        source: memory.source,
        sourceId: memory.sourceId ?? null,
        createdAt: memory.createdAt,
      };
      state().memories.set(`${userId}:${memory.id}`, stored);
      return stored;
    },

    async forgetMemory(userId, memoryId) {
      return state().memories.delete(`${userId}:${memoryId}`);
    },
  };
}
