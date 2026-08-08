/**
 * Rescue transcripts that were only ever written onto Enrichments.
 *
 * Audio Captures have been transcribed since ADR 0015, but the transcript
 * lived on the Enrichment row alone. Every surface that shows the walker's
 * own words reads the Capture — the day digest, search, the To-do list, the
 * Day flow card, the notebook — so a spoken walk was blank to all of them,
 * and the day digest in particular came out worthless.
 *
 * The pipeline now writes `sync_captures.transcript` as it transcribes. This
 * copies the ones already recorded, so past walks are rescued rather than
 * needing to be re-enriched (which would re-spend the gateway and rewrite
 * reports the walker may have already filed).
 *
 *   fnox exec --profile prod -- node scripts/backfill-capture-transcripts.mjs --dry-run
 *   fnox exec --profile prod -- node scripts/backfill-capture-transcripts.mjs
 *   fnox exec --profile prod -- node scripts/backfill-capture-transcripts.mjs --day 2026-08-08
 *
 * --day limits the run to Captures created on one civil day (UTC), for
 * rescuing today without touching the archive. --force overwrites a
 * transcript that is already there; by default an existing one is kept,
 * because a later re-transcription is not automatically better.
 */
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const dayIndex = args.indexOf("--day");
const day = dayIndex >= 0 ? args[dayIndex + 1] : null;

if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
  console.error(`--day expects YYYY-MM-DD, got ${day}`);
  process.exit(1);
}

const connection = process.env.DATABASE_URL;
if (!connection) {
  console.error(
    "DATABASE_URL is not set. Run through fnox:\n" +
      "  fnox exec --profile prod -- node scripts/backfill-capture-transcripts.mjs --dry-run",
  );
  process.exit(1);
}

const sql = neon(connection);

async function main() {
  // The column the pipeline now writes; a run against an older database
  // should say so rather than fail mid-way.
  const columns = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'sync_captures' AND column_name = 'transcript'
  `;
  if (columns.length === 0) {
    console.error(
      "sync_captures.transcript does not exist yet — deploy the app once so " +
        "the schema migration runs, then re-run this script.",
    );
    process.exit(1);
  }

  const rows = await sql`
    SELECT id, user_id, transcripts
    FROM enrichments
    WHERE jsonb_array_length(COALESCE(transcripts, '[]'::jsonb)) > 0
    ORDER BY created_at ASC
  `;

  console.log(`${rows.length} Enrichment(s) carry transcripts.`);

  /** captureId -> { userId, text } — the newest transcript per Capture wins. */
  const byCapture = new Map();
  for (const row of rows) {
    for (const transcript of row.transcripts ?? []) {
      const captureId = transcript?.captureId;
      const text = (transcript?.text ?? "").trim();
      if (!captureId || !text) continue;
      byCapture.set(captureId, { userId: row.user_id, text });
    }
  }

  console.log(`${byCapture.size} Capture(s) have a transcript to restore.`);

  let written = 0;
  let skippedExisting = 0;
  let missing = 0;
  let outOfRange = 0;

  for (const [captureId, { userId, text }] of byCapture) {
    const existing = await sql`
      SELECT id, transcript, created_at, text
      FROM sync_captures
      WHERE user_id = ${userId} AND id = ${captureId}
    `;
    const capture = existing[0];
    if (!capture) {
      missing += 1;
      continue;
    }
    if (day) {
      const captureDay = new Date(capture.created_at).toISOString().slice(0, 10);
      if (captureDay !== day) {
        outOfRange += 1;
        continue;
      }
    }
    if (capture.transcript && !force) {
      skippedExisting += 1;
      continue;
    }

    if (dryRun) {
      const preview = text.length > 70 ? `${text.slice(0, 70)}…` : text;
      const typed = (capture.text ?? "").trim().length > 0 ? " (also typed)" : "";
      console.log(`  would write ${captureId}${typed}: ${preview}`);
    } else {
      await sql`
        UPDATE sync_captures
        SET transcript = ${text}
        WHERE user_id = ${userId} AND id = ${captureId}
      `;
    }
    written += 1;
  }

  console.log(
    [
      dryRun ? "DRY RUN — nothing written." : "Done.",
      `${written} Capture(s) ${dryRun ? "would get" : "got"} their words back`,
      skippedExisting ? `${skippedExisting} already had one (use --force)` : null,
      missing ? `${missing} Capture(s) no longer exist` : null,
      outOfRange ? `${outOfRange} outside --day ${day}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
