/**
 * What happened to a day's reports — and how to get them written.
 *
 * A walk ends with a Capture per thought, an Enrichment job per Thread, and a
 * report per job. When the day view says "No Enrichment yet" the break is at
 * one of those three joints, and from the outside they look identical. This
 * reads all three at once and says which one it is.
 *
 *   fnox exec --profile prod -- node scripts/day-doctor.mjs
 *   fnox exec --profile prod -- node scripts/day-doctor.mjs --day 2026-08-07
 *   fnox exec --profile prod -- node scripts/day-doctor.mjs --fix
 *   fnox exec --profile prod -- node scripts/day-doctor.mjs --redo
 *
 * Reading is the default and it writes nothing.
 *
 * --fix   unsticks the queue: a job stuck `running` because the invocation
 *         holding it was killed goes back to `queued`, and a job that failed
 *         for a reason a retry could fix is offered again. Failures no retry
 *         can fix (the media is gone) are named and left alone.
 *
 * --redo  throws the day's reports away and has them written again: the
 *         Captures are released from the Enrichment that covered them, so the
 *         queue treats them as never researched. By default only Threads whose
 *         report is missing or too thin to be worth reading; --all for every
 *         Thread of the day, including ones whose report came out fine.
 *
 * Neither flag writes a report itself. The queue does that, on the next
 * /api/enrichment/process — which the desk fires when you open it. So: run
 * this, then open the desk and leave it open for a minute.
 *
 * --day is a civil day in UTC, matching the transcript backfill. Morning walks
 * in the Americas fall inside their own UTC day; a walk after 8pm Eastern does
 * not, and needs tomorrow's date.
 */
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const fix = has("--fix");
const redo = has("--redo");
const all = has("--all");
const dayIndex = args.indexOf("--day");
const day = dayIndex >= 0 ? args[dayIndex + 1] : new Date().toISOString().slice(0, 10);

if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
  console.error(`--day expects YYYY-MM-DD, got ${day}`);
  process.exit(1);
}

const connection = process.env.DATABASE_URL;
if (!connection) {
  console.error(
    "DATABASE_URL is not set. Run through fnox:\n" +
      "  fnox exec --profile prod -- node scripts/day-doctor.mjs",
  );
  process.exit(1);
}

const sql = neon(connection);

/** Mirrors lib/enrichment/failures.ts — a retry cannot bring these back. */
function isPermanent(reason) {
  return (
    /^missing_original_media_/.test(reason) ||
    /^model_.+_unsupported_media_/.test(reason)
  );
}

/**
 * A report the walker would not thank us for. Short enough that whatever the
 * model had to work with, it wasn't the walk — the exact shape a day of
 * recordings produced before transcripts reached the Capture.
 */
const THIN_REPORT = 240;

/** How long a claim may sit before we call the invocation that took it dead. */
const STALE_CLAIM_MINUTES = 15;

function clock(at) {
  return new Date(at).toISOString().slice(11, 16);
}

function short(text, width = 64) {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length > width ? `${flat.slice(0, width)}…` : flat;
}

async function main() {
  const nextDay = new Date(`${day}T00:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const until = nextDay.toISOString().slice(0, 10);

  const captures = await sql`
    SELECT id, user_id, thread_id, text, transcript, created_at, attachments
    FROM sync_captures
    WHERE created_at >= ${`${day}T00:00:00.000Z`}
      AND created_at < ${`${until}T00:00:00.000Z`}
    ORDER BY created_at ASC
  `;

  if (captures.length === 0) {
    console.log(`Nothing was captured on ${day} (UTC).`);
    console.log(
      "A walk after 8pm Eastern lands on the next UTC day — try --day " +
        `${until}.`,
    );
    return;
  }

  const threadIds = [...new Set(captures.map((c) => c.thread_id))];
  const captureIds = captures.map((c) => c.id);

  const [threads, enrichments, inclusions, jobs] = await Promise.all([
    sql`
      SELECT id, user_id, title, revision, kind, route, reviewed_at
      FROM sync_threads WHERE id = ANY(${threadIds})
    `,
    sql`
      SELECT id, thread_id, text, model, created_at, target_capture_ids,
             jsonb_array_length(COALESCE(transcripts, '[]'::jsonb)) AS transcript_count
      FROM enrichments WHERE thread_id = ANY(${threadIds})
      ORDER BY created_at ASC
    `,
    sql`
      SELECT capture_id, enrichment_id
      FROM enrichment_inclusions WHERE capture_id = ANY(${captureIds})
    `,
    sql`
      SELECT id, thread_id, status, attempts, error, model, started_at
      FROM enrichment_jobs WHERE thread_id = ANY(${threadIds})
    `,
  ]);

  const threadsById = new Map(threads.map((t) => [t.id, t]));
  const includedBy = new Map(inclusions.map((r) => [r.capture_id, r.enrichment_id]));
  const enrichmentIds = new Set(enrichments.map((e) => e.id));

  const byThread = new Map();
  for (const capture of captures) {
    const bucket = byThread.get(capture.thread_id) ?? [];
    bucket.push(capture);
    byThread.set(capture.thread_id, bucket);
  }

  console.log(
    `${day} (UTC) — ${captures.length} Capture(s) across ${threadIds.length} Thread(s).\n`,
  );

  /** threadId -> why its report is not readable, or null when it is. */
  const ailing = new Map();
  let healthy = 0;

  for (const threadId of threadIds) {
    const thread = threadsById.get(threadId);
    const mine = byThread.get(threadId) ?? [];
    const threadEnrichments = enrichments.filter((e) => e.thread_id === threadId);
    const latest = threadEnrichments[threadEnrichments.length - 1] ?? null;
    const threadJobs = jobs.filter((j) => j.thread_id === threadId);

    console.log(
      `▸ ${thread?.title ?? "(Thread missing)"}` +
        `  ${[thread?.kind, thread?.route ? `→ ${thread.route}` : null]
          .filter(Boolean)
          .join(" · ")}`,
    );

    for (const capture of mine) {
      const attachments = capture.attachments ?? [];
      const kinds = [...new Set(attachments.map((a) => a.kind))];
      const badge = kinds.includes("audio")
        ? "🎙"
        : kinds.includes("image")
          ? "📷"
          : "  ";
      const typed = (capture.text ?? "").trim();
      const words = typed || (capture.transcript ?? "").trim();
      const source = typed ? "" : capture.transcript ? " (transcript)" : "";
      const inclusion = includedBy.get(capture.id) ?? null;
      // An inclusion pointing at an Enrichment that no longer exists is the
      // quiet one: the Capture counts as researched, so the queue skips it
      // forever, and there is no report to show for it.
      const orphaned = inclusion !== null && !enrichmentIds.has(inclusion);
      console.log(
        `    ${clock(capture.created_at)} ${badge} ` +
          (words ? `"${short(words)}"${source}` : "(no words)") +
          (orphaned ? "   ⚠ covered by a report that is gone" : "") +
          (!inclusion ? "   · not yet researched" : ""),
      );
      if (orphaned) ailing.set(threadId, "orphaned inclusion");
      if (!words) ailing.set(threadId, ailing.get(threadId) ?? "no words");
    }

    if (latest) {
      const length = (latest.text ?? "").trim().length;
      const thin = length < THIN_REPORT;
      console.log(
        `    report: ${length} chars via ${latest.model}` +
          (latest.transcript_count > 0
            ? `, ${latest.transcript_count} transcript(s)`
            : "") +
          (thin ? "   ⚠ too thin to be worth reading" : ""),
      );
      if (thin) ailing.set(threadId, "thin report");
      else if (!ailing.has(threadId)) healthy += 1;
    } else {
      console.log("    report: none");
      ailing.set(threadId, "no report");
    }

    for (const job of threadJobs) {
      const age = job.started_at
        ? Math.round((Date.now() - new Date(job.started_at).getTime()) / 60000)
        : null;
      const detail =
        job.status === "failed"
          ? `  ${isPermanent(job.error ?? "") ? "permanent" : "retryable"}: ${short(job.error, 90)}`
          : job.status === "running" && age !== null
            ? `  claimed ${age} min ago${age > STALE_CLAIM_MINUTES ? " ⚠ stuck" : ""}`
            : "";
      console.log(`    job ${job.status} ×${job.attempts}${detail}`);
      if (job.status === "failed" || job.status === "running") {
        ailing.set(threadId, ailing.get(threadId) ?? `job ${job.status}`);
      }
    }
    if (threadJobs.length === 0 && !latest) {
      console.log("    job: never queued");
    }
    console.log("");
  }

  console.log(
    `${healthy} Thread(s) have a report worth reading; ${ailing.size} do not.`,
  );
  if (ailing.size > 0) {
    const causes = new Map();
    for (const cause of ailing.values()) {
      causes.set(cause, (causes.get(cause) ?? 0) + 1);
    }
    for (const [cause, count] of [...causes].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count} × ${cause}`);
    }
  }

  if (!fix && !redo) {
    console.log(
      "\nRead only — nothing written. --fix unsticks the queue, --redo has the reports written again.",
    );
    return;
  }

  if (fix) {
    const staleBefore = new Date(
      Date.now() - STALE_CLAIM_MINUTES * 60_000,
    ).toISOString();
    const stuck = await sql`
      UPDATE enrichment_jobs
      SET status = 'queued', started_at = NULL
      WHERE thread_id = ANY(${threadIds})
        AND status = 'running'
        AND (started_at IS NULL OR started_at < ${staleBefore})
      RETURNING id
    `;
    const retryable = jobs.filter(
      (job) => job.status === "failed" && !isPermanent(job.error ?? ""),
    );
    if (retryable.length > 0) {
      await sql`
        UPDATE enrichment_jobs
        SET status = 'queued', attempts = 0, error = NULL, started_at = NULL
        WHERE id = ANY(${retryable.map((job) => job.id)})
      `;
    }
    const permanent = jobs.filter(
      (job) => job.status === "failed" && isPermanent(job.error ?? ""),
    );
    console.log(
      `\nfix · ${stuck.length} stuck claim(s) released · ${retryable.length} failed job(s) offered again` +
        (permanent.length > 0
          ? ` · ${permanent.length} left alone (no retry can fix them)`
          : ""),
    );
    for (const job of permanent) {
      console.log(`      ${threadsById.get(job.thread_id)?.title}: ${job.error}`);
    }
  }

  if (redo) {
    const targets = all ? threadIds : [...ailing.keys()];
    const targetCaptureIds = captures
      .filter((capture) => targets.includes(capture.thread_id))
      .map((capture) => capture.id);

    if (targetCaptureIds.length === 0) {
      console.log("\nredo · nothing to redo.");
      return;
    }

    // Releasing the Captures is the whole gesture: `listPendingThreads` calls
    // a Capture researched only because a row here says so, and the queue
    // writes a fresh report for anything it finds unresearched. The old
    // report stays in the Thread's history — a report the walker may have
    // already read and acted on is not ours to delete.
    const released = await sql`
      DELETE FROM enrichment_inclusions
      WHERE capture_id = ANY(${targetCaptureIds})
      RETURNING capture_id
    `;
    console.log(
      `\nredo · ${released.length} Capture(s) across ${targets.length} Thread(s) released for a fresh report.`,
    );
    console.log(
      "      Open the desk and leave it open — the queue writes them on its next cycle.",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
