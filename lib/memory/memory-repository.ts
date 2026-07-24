import { materializeMemories } from "./patches";
import type { MemoryPatch, WalkerMemoryRepository } from "./types";

type MemoryState = {
  /** userId -> append-only patch log */
  patches: Map<string, MemoryPatch[]>;
};

const states = new Map<string, MemoryState>();

function stateFor(namespace: string): MemoryState {
  const existing = states.get(namespace);
  if (existing) return existing;
  const created: MemoryState = { patches: new Map() };
  states.set(namespace, created);
  return created;
}

export function resetMemoryWalkerMemoryRepository(namespace = "default"): void {
  states.set(namespace, { patches: new Map() });
}

export function createMemoryWalkerMemoryRepository(
  namespace = "default",
): WalkerMemoryRepository {
  const state = () => stateFor(namespace);

  return {
    async listMemories(userId) {
      return materializeMemories(state().patches.get(userId) ?? []);
    },

    async listPatches(userId) {
      return [...(state().patches.get(userId) ?? [])];
    },

    async appendPatch(userId, patch) {
      const log = state().patches.get(userId) ?? [];
      log.push(patch);
      state().patches.set(userId, log);
      return patch;
    },
  };
}
