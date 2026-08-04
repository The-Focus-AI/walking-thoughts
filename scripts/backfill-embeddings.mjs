/**
 * Backfill Thread embeddings over Threads enriched before similarity existed.
 *
 * Reads each Thread's Captures (sync_captures) and its latest Enrichment,
 * embeds the two together, and writes the vector into thread_embeddings.
 * Idempotent: a Thread already embedded under the current model is skipped
 * unless --force, which is also how you re-embed after changing the model
 * (two models do not share a vector space, so a mixed table is a table of
 * nonsense).
 *
 * Check the model against the gateway's live /v1/models table before running
 * this; AI_GATEWAY_EMBEDDING_MODEL names it, and the default mirrors
 * lib/enrichment/embeddings.ts — that file is canonical, this copy exists
 * because a plain-JS script cannot import the TypeScript module.
 *
 *   # Source .fnox/env first so OP_SERVICE_ACCOUNT_TOKEN is set, then:
 *   fnox exec --profile prod -- node scripts/backfill-embeddings.mjs --dry-run
 *   fnox exec --profile prod -- node scripts/backfill-embeddings.mjs
 *   fnox exec --profile prod -- node scripts/backfill-embeddings.mjs --force
 */
import { neon } from "@neondatabase/serverless";
import { embed } from "ai";

const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
const TEXT_LIMIT = 4000;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Run under fnox exec.");
  process.exit(1);
}
const model =
  process.env.AI_GATEWAY_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;

const sql = neon(databaseUrl);

async function main() {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`
    CREATE TABLE IF NOT EXISTS thread_embeddings (
      user_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      model TEXT NOT NULL,
      embedding vector NOT NULL,
      embedded_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (user_id, thread_id)
    )
  `;

  // Live schema uses the sync_* tables (see lib/sync/neon-repository.ts).
  // Older names (threads / captures) were never the production surface.
  const threads = await sql`
    SELECT id, user_id, title FROM sync_threads ORDER BY updated_at ASC
  `;
  const done = force
    ? new Set()
    : new Set(
        (
          await sql`
            SELECT user_id, thread_id FROM thread_embeddings
            WHERE model = ${model}
          `
        ).map((row) => `${row.user_id}:${row.thread_id}`),
      );

  console.log(
    `${threads.length} Threads; ${done.size} already embedded with ${model}${
      dryRun ? " (dry run)" : ""
    }`,
  );

  let embedded = 0;
  let skipped = 0;
  let empty = 0;
  let failed = 0;

  for (const thread of threads) {
    if (done.has(`${thread.user_id}:${thread.id}`)) {
      skipped += 1;
      continue;
    }

    const captures = await sql`
      SELECT text FROM sync_captures
      WHERE user_id = ${thread.user_id} AND thread_id = ${thread.id}
      ORDER BY sequence ASC
    `;
    const enrichments = await sql`
      SELECT text FROM enrichments
      WHERE user_id = ${thread.user_id} AND thread_id = ${thread.id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const text = [
      ...captures.map((row) => row.text ?? ""),
      enrichments[0]?.text ?? "",
    ]
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join("\n\n")
      .slice(0, TEXT_LIMIT);

    if (!text) {
      empty += 1;
      continue;
    }
    if (dryRun) {
      embedded += 1;
      continue;
    }

    try {
      const { embedding } = await embed({ model, value: text });
      const literal = `[${[...embedding].join(",")}]`;
      await sql`
        INSERT INTO thread_embeddings (
          user_id, thread_id, model, embedding, embedded_at
        ) VALUES (
          ${thread.user_id}, ${thread.id}, ${model}, ${literal}::vector,
          ${new Date().toISOString()}
        )
        ON CONFLICT (user_id, thread_id) DO UPDATE
        SET model = EXCLUDED.model,
            embedding = EXCLUDED.embedding,
            embedded_at = EXCLUDED.embedded_at
      `;
      embedded += 1;
    } catch (error) {
      // One Thread that will not embed must not end the backfill; it is
      // reported and the run carries on.
      failed += 1;
      console.error(`  ${thread.id} failed: ${String(error)}`);
    }
  }

  console.log(
    `embedded ${embedded}, skipped ${skipped}, nothing to embed ${empty}, failed ${failed}`,
  );
}

await main();
