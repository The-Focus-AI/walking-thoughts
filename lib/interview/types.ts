import type { MemoryCategory } from "@/lib/memory/types";

/**
 * One turn of the Interview: a question Walking Thoughts asked and, once the
 * walker responds, the answer plus the Memories learned from it.
 */
export type InterviewTurn = {
  id: string;
  question: string;
  category: MemoryCategory;
  askedAt: string;
  answer: string | null;
  answeredAt: string | null;
  skipped: boolean;
  /** Memories saved from this turn's answer. */
  memoryIds: string[];
};

export type InterviewTurnResolution = {
  answer: string | null;
  skipped: boolean;
  memoryIds: string[];
  answeredAt: string;
};

export type InterviewRepository = {
  listTurns(userId: string): Promise<InterviewTurn[]>;
  addTurn(
    userId: string,
    turn: {
      id: string;
      question: string;
      category: MemoryCategory;
      askedAt: string;
    },
  ): Promise<InterviewTurn>;
  resolveTurn(
    userId: string,
    turnId: string,
    resolution: InterviewTurnResolution,
  ): Promise<InterviewTurn>;
};
