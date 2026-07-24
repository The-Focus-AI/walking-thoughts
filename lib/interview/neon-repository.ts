import { neon } from "@neondatabase/serverless";
import type { MemoryCategory } from "@/lib/memory/types";
import type { InterviewRepository, InterviewTurn } from "./types";

export function createNeonInterviewRepository(
  databaseUrl: string,
): InterviewRepository {
  const sql = neon(databaseUrl);
  let ready: Promise<void> | null = null;
  const ensure = () => {
    ready ??= (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS interview_turns (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          question TEXT NOT NULL,
          category TEXT NOT NULL,
          asked_at TIMESTAMPTZ NOT NULL,
          answer TEXT,
          answered_at TIMESTAMPTZ,
          skipped BOOLEAN NOT NULL DEFAULT FALSE,
          memory_ids JSONB NOT NULL DEFAULT '[]'::jsonb
        )
      `;
    })();
    return ready;
  };

  function mapTurn(row: {
    id: string;
    question: string;
    category: MemoryCategory;
    asked_at: string;
    answer: string | null;
    answered_at: string | null;
    skipped: boolean;
    memory_ids: string[];
  }): InterviewTurn {
    return {
      id: row.id,
      question: row.question,
      category: row.category,
      askedAt: row.asked_at,
      answer: row.answer,
      answeredAt: row.answered_at,
      skipped: row.skipped,
      memoryIds: row.memory_ids ?? [],
    };
  }

  return {
    async listTurns(userId) {
      await ensure();
      const rows = (await sql`
        SELECT id, question, category, asked_at, answer, answered_at,
               skipped, memory_ids
        FROM interview_turns
        WHERE user_id = ${userId}
        ORDER BY asked_at ASC
      `) as Array<Parameters<typeof mapTurn>[0]>;
      return rows.map(mapTurn);
    },

    async addTurn(userId, turn) {
      await ensure();
      await sql`
        INSERT INTO interview_turns (
          id, user_id, question, category, asked_at, skipped, memory_ids
        ) VALUES (
          ${turn.id},
          ${userId},
          ${turn.question},
          ${turn.category},
          ${turn.askedAt},
          FALSE,
          '[]'::jsonb
        )
        ON CONFLICT (id) DO NOTHING
      `;
      return {
        id: turn.id,
        question: turn.question,
        category: turn.category,
        askedAt: turn.askedAt,
        answer: null,
        answeredAt: null,
        skipped: false,
        memoryIds: [],
      };
    },

    async resolveTurn(userId, turnId, resolution) {
      await ensure();
      const rows = (await sql`
        UPDATE interview_turns
        SET answer = ${resolution.answer},
            answered_at = ${resolution.answeredAt},
            skipped = ${resolution.skipped},
            memory_ids = ${JSON.stringify(resolution.memoryIds)}
        WHERE user_id = ${userId} AND id = ${turnId}
        RETURNING id, question, category, asked_at, answer, answered_at,
                  skipped, memory_ids
      `) as Array<Parameters<typeof mapTurn>[0]>;
      if (!rows[0]) throw new Error(`Unknown interview turn ${turnId}`);
      return mapTurn(rows[0]);
    },
  };
}
