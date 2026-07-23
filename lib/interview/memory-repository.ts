import type { InterviewRepository, InterviewTurn } from "./types";

type InterviewState = {
  /** userId -> ordered turns */
  turns: Map<string, InterviewTurn[]>;
};

const states = new Map<string, InterviewState>();

function stateFor(namespace: string): InterviewState {
  const existing = states.get(namespace);
  if (existing) return existing;
  const created: InterviewState = { turns: new Map() };
  states.set(namespace, created);
  return created;
}

export function resetMemoryInterviewRepository(namespace = "default"): void {
  states.set(namespace, { turns: new Map() });
}

export function createMemoryInterviewRepository(
  namespace = "default",
): InterviewRepository {
  const state = () => stateFor(namespace);

  return {
    async listTurns(userId) {
      return [...(state().turns.get(userId) ?? [])];
    },

    async addTurn(userId, turn) {
      const created: InterviewTurn = {
        id: turn.id,
        question: turn.question,
        category: turn.category,
        askedAt: turn.askedAt,
        answer: null,
        answeredAt: null,
        skipped: false,
        memoryIds: [],
      };
      const turns = state().turns.get(userId) ?? [];
      turns.push(created);
      state().turns.set(userId, turns);
      return created;
    },

    async resolveTurn(userId, turnId, resolution) {
      const turns = state().turns.get(userId) ?? [];
      const index = turns.findIndex((turn) => turn.id === turnId);
      if (index === -1) throw new Error(`Unknown interview turn ${turnId}`);
      const resolved: InterviewTurn = {
        ...turns[index],
        answer: resolution.answer,
        skipped: resolution.skipped,
        memoryIds: [...resolution.memoryIds],
        answeredAt: resolution.answeredAt,
      };
      turns[index] = resolved;
      return resolved;
    },
  };
}
