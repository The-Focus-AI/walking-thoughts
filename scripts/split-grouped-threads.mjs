#!/usr/bin/env node
// Split legacy grouped Threads into one Thread per Capture (ADR 0011).
//
// Under the retired sticky day-Thread flow, every Capture committed on the
// same calendar day landed in one Thread. This script re-homes each Capture
// after the first into its own Thread (id = capture id, sequence 1) and
// clears the affected Threads' Enrichment artifacts so each Thread gets a
// fresh individual Enrichment and title on the next processing pass.
//
// Usage:
//   DATABASE_URL=... node scripts/split-grouped-threads.mjs [--date YYYY-MM-DD]
//     [--tz-offset -04:00] [--apply]
//
// Dry-run by default; pass --apply to write. Only Threads whose earliest
// Capture falls inside the target day are touched. Re-running is a no-op
// once every Thread holds a single Capture.

import { neon } from "@neondatabase/serverless";

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

const apply = process.argv.includes("--apply");
const tzOffset = arg("--tz-offset", "-04:00");
const date =
  arg("--date", null) ??
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
    new Date(),
  );

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`Invalid --date ${date}; expected YYYY-MM-DD`);
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(2);
}

const dayStart = `${date}T00:00:00${tzOffset}`;
const dayEnd = new Date(
  new Date(dayStart).getTime() + 24 * 60 * 60 * 1000,
).toISOString();

// Mirrors titleFromText in lib/local-capture/thread-destination.ts.
function titleFromText(text) {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? text;
  return firstLine.slice(0, 80) || "Thread";
}

function captureTitle(capture) {
  const attachments = capture.attachments ?? [];
  return titleFromText(capture.text || attachments[0]?.fileName || "Capture");
}

const sql = neon(databaseUrl);

const grouped = await sql`
  SELECT thread_id, user_id
  FROM sync_captures
  GROUP BY thread_id, user_id
  HAVING COUNT(*) > 1
     AND MIN(created_at) >= ${dayStart}
     AND MIN(created_at) < ${dayEnd}
`;

if (grouped.length === 0) {
  console.log(
    `No multi-Capture Threads starting on ${date} (${dayStart} .. ${dayEnd}). Nothing to do.`,
  );
  process.exit(0);
}

for (const { thread_id: threadId, user_id: userId } of grouped) {
  const captures = await sql`
    SELECT id, text, created_at, sequence, attachments
    FROM sync_captures
    WHERE user_id = ${userId} AND thread_id = ${threadId}
    ORDER BY sequence ASC, created_at ASC
  `;
  const [keep, ...movers] = captures;
  const captureIds = captures.map((capture) => capture.id);

  console.log(
    `\nThread ${threadId} (user ${userId}): ${captures.length} Captures`,
  );
  console.log(
    `  keep   ${keep.id} seq ${keep.sequence} -> 1  "${captureTitle(keep)}"`,
  );
  for (const mover of movers) {
    console.log(
      `  split  ${mover.id} seq ${mover.sequence} -> own Thread "${captureTitle(mover)}"`,
    );
  }
  console.log(
    "  reset  Enrichments, inclusions, and jobs for the affected Threads",
  );

  if (!apply) continue;

  const statements = [
    sql`
      DELETE FROM enrichment_inclusions
      WHERE user_id = ${userId} AND capture_id = ANY(${captureIds})
    `,
    sql`
      DELETE FROM enrichments
      WHERE user_id = ${userId} AND thread_id = ${threadId}
    `,
    sql`
      DELETE FROM enrichment_jobs
      WHERE user_id = ${userId} AND thread_id = ${threadId}
    `,
    sql`
      UPDATE sync_threads
      SET title = ${captureTitle(keep)},
          revision = 1,
          updated_at = ${keep.created_at}
      WHERE user_id = ${userId} AND id = ${threadId}
    `,
    sql`
      UPDATE sync_captures
      SET sequence = 1
      WHERE user_id = ${userId} AND id = ${keep.id}
    `,
  ];
  for (const mover of movers) {
    statements.push(
      sql`
        INSERT INTO sync_threads (id, user_id, title, revision, updated_at)
        VALUES (
          ${mover.id},
          ${userId},
          ${captureTitle(mover)},
          1,
          ${mover.created_at}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          revision = 1,
          updated_at = EXCLUDED.updated_at
      `,
      sql`
        UPDATE sync_captures
        SET thread_id = ${mover.id}, sequence = 1
        WHERE user_id = ${userId} AND id = ${mover.id}
      `,
    );
  }
  await sql.transaction(statements);
  console.log(`  applied: ${threadId} split into ${captures.length} Threads`);
}

console.log(
  apply
    ? "\nDone. The next sync cycle re-queues one Enrichment per Thread and devices re-home Captures on hydration."
    : "\nDry run only — re-run with --apply to write these changes.",
);
