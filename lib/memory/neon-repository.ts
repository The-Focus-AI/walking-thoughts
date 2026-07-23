import { neon } from "@neondatabase/serverless";
import type {
  WalkerMemory,
  WalkerMemoryRepository,
} from "./types";

export function createNeonWalkerMemoryRepository(
  databaseUrl: string,
): WalkerMemoryRepository {
  const sql = neon(databaseUrl);
  let ready: Promise<void> | null = null;
  const ensure = () => {
    ready ??= (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS walker_memories (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          category TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL,
          source_id TEXT,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;
    })();
    return ready;
  };

  function mapMemory(row: {
    id: string;
    category: WalkerMemory["category"];
    content: string;
    source: WalkerMemory["source"];
    source_id: string | null;
    created_at: string;
  }): WalkerMemory {
    return {
      id: row.id,
      category: row.category,
      content: row.content,
      source: row.source,
      sourceId: row.source_id,
      createdAt: row.created_at,
    };
  }

  return {
    async listMemories(userId) {
      await ensure();
      const rows = (await sql`
        SELECT id, category, content, source, source_id, created_at
        FROM walker_memories
        WHERE user_id = ${userId}
        ORDER BY created_at ASC
      `) as Array<{
        id: string;
        category: WalkerMemory["category"];
        content: string;
        source: WalkerMemory["source"];
        source_id: string | null;
        created_at: string;
      }>;
      return rows.map(mapMemory);
    },

    async saveMemory(userId, memory) {
      await ensure();
      await sql`
        INSERT INTO walker_memories (
          id, user_id, category, content, source, source_id, created_at
        ) VALUES (
          ${memory.id},
          ${userId},
          ${memory.category},
          ${memory.content},
          ${memory.source},
          ${memory.sourceId ?? null},
          ${memory.createdAt}
        )
        ON CONFLICT (id) DO UPDATE
        SET category = EXCLUDED.category,
            content = EXCLUDED.content
        WHERE walker_memories.user_id = ${userId}
      `;
      return {
        id: memory.id,
        category: memory.category,
        content: memory.content,
        source: memory.source,
        sourceId: memory.sourceId ?? null,
        createdAt: memory.createdAt,
      };
    },

    async forgetMemory(userId, memoryId) {
      await ensure();
      const deleted = (await sql`
        DELETE FROM walker_memories
        WHERE user_id = ${userId} AND id = ${memoryId}
        RETURNING id
      `) as Array<{ id: string }>;
      return deleted.length > 0;
    },
  };
}
