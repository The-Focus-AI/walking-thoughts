import { neon } from "@neondatabase/serverless";
import { materializeMemories } from "./patches";
import type { MemoryPatch, WalkerMemoryRepository } from "./types";

export function createNeonWalkerMemoryRepository(
  databaseUrl: string,
): WalkerMemoryRepository {
  const sql = neon(databaseUrl);
  let ready: Promise<void> | null = null;
  const ensure = () => {
    ready ??= (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS memory_patches (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          op TEXT NOT NULL,
          memory_id TEXT NOT NULL,
          category TEXT NOT NULL,
          before_content TEXT,
          after_content TEXT,
          source TEXT NOT NULL,
          source_id TEXT,
          reverts_patch_id TEXT,
          created_at TIMESTAMPTZ NOT NULL
        )
      `;
    })();
    return ready;
  };

  function mapPatch(row: {
    id: string;
    op: MemoryPatch["op"];
    memory_id: string;
    category: MemoryPatch["category"];
    before_content: string | null;
    after_content: string | null;
    source: MemoryPatch["source"];
    source_id: string | null;
    reverts_patch_id: string | null;
    created_at: string;
  }): MemoryPatch {
    return {
      id: row.id,
      op: row.op,
      memoryId: row.memory_id,
      category: row.category,
      before: row.before_content,
      after: row.after_content,
      source: row.source,
      sourceId: row.source_id,
      revertsPatchId: row.reverts_patch_id,
      createdAt: row.created_at,
    };
  }

  async function fetchPatches(userId: string): Promise<MemoryPatch[]> {
    await ensure();
    const rows = (await sql`
      SELECT id, op, memory_id, category, before_content, after_content,
             source, source_id, reverts_patch_id, created_at
      FROM memory_patches
      WHERE user_id = ${userId}
      ORDER BY created_at ASC, id ASC
    `) as Array<Parameters<typeof mapPatch>[0]>;
    return rows.map(mapPatch);
  }

  return {
    async listMemories(userId) {
      return materializeMemories(await fetchPatches(userId));
    },

    async listPatches(userId) {
      return fetchPatches(userId);
    },

    async appendPatch(userId, patch) {
      await ensure();
      await sql`
        INSERT INTO memory_patches (
          id, user_id, op, memory_id, category, before_content,
          after_content, source, source_id, reverts_patch_id, created_at
        ) VALUES (
          ${patch.id},
          ${userId},
          ${patch.op},
          ${patch.memoryId},
          ${patch.category},
          ${patch.before},
          ${patch.after},
          ${patch.source},
          ${patch.sourceId},
          ${patch.revertsPatchId},
          ${patch.createdAt}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      return patch;
    },
  };
}
