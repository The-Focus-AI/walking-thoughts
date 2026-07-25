/**
 * Backfill Thread classification over Threads enriched before KIND existed.
 *
 * Reads every Thread's Captures and its latest Enrichment, asks the gateway
 * what kind of Thread it is, and writes kind/topics onto both the Thread and
 * that Enrichment. Threads that already carry a kind are skipped unless
 * --force. A Thread whose title was auto-derived (the Capture's first 80
 * characters, or the placeholder "Thread") also gets the proposed title.
 *
 * The register below mirrors DEFAULT_ENRICHMENT_SYSTEM_INSTRUCTION in
 * lib/enrichment/system-instruction.ts — that file is canonical; this copy
 * exists because a plain-JS script cannot import the TypeScript module.
 *
 *   fnox exec --profile prod -- node scripts/classify-threads.mjs --dry-run
 *   fnox exec --profile prod -- node scripts/classify-threads.mjs
 */
import { neon } from "@neondatabase/serverless";
import { generateText } from "ai";

const KINDS = [
  "question",
  "idea",
  "task",
  "observation",
  "place",
  "media",
  "noise",
];

const SYSTEM = [
  "You are Walking Thoughts, classifying one walker's Threads so each can be handled in the register it deserves.",
  `Answer with exactly one kind from: ${KINDS.join(", ")}.`,
  "question — a genuine lookup the walker wants researched.",
  "idea — something the walker wants to build or try later, dictated as a spec.",
  "task — something to do: a call to make, a thing to order, an appointment to book.",
  "observation — an opinion or aphorism, offered rather than asked.",
  "place — a photograph or a moment on the walk, with no question in it.",
  "media — an attachment with no words of its own.",
  "noise — a test entry or an accident.",
  "Judge the Capture the walker wrote, not the report that answered it: a research report attached to a photo caption does not make the Thread a question.",
].join(" ");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const model = process.env.AI_GATEWAY_MODEL?.trim() || "anthropic/claude-sonnet-5";
const CONCURRENCY = 5;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!process.env.AI_GATEWAY_API_KEY) {
  throw new Error("AI_GATEWAY_API_KEY is required");
}
const sql = neon(databaseUrl);

function isDerivedTitle(title, captures) {
  if (!title || title === "Thread") return true;
  return captures.some(
    (capture) =>
      capture.text.trim().length > 0 &&
      capture.text.trim().slice(0, 80) === title,
  );
}

function buildPrompt(thread) {
  const captures = thread.captures
    .map((capture) => {
      const media = (capture.attachments ?? [])
        .map((attachment) => attachment.kind)
        .join(", ");
      const parts = [
        capture.text.trim() || "(no text)",
        media ? `attachments: ${media}` : null,
        capture.location ? "has location" : null,
      ].filter(Boolean);
      return `- ${parts.join("; ")}`;
    })
    .join("\n");

  const report = thread.enrichmentText
    ? `\nThe report that answered it (for context only, do not classify it):\n${thread.enrichmentText.slice(0, 800)}`
    : "\nNo report was ever written for this Thread.";

  return [
    `Current Thread title: ${thread.title}`,
    `What the walker captured:\n${captures}`,
    report,
    [
      "Reply with exactly these lines and nothing else:",
      "TITLE: a short recognizable Thread title (max 8 words)",
      `KIND: one of ${KINDS.join(", ")}`,
      "TOPICS: up to four lowercase hyphenated slugs, comma separated",
    ].join("\n"),
  ].join("\n\n");
}

function parseHeaders(text) {
  const headers = new Map();
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*(TITLE|KIND|TOPICS)\s*:\s*(.*)$/i);
    if (match) headers.set(match[1].toUpperCase(), match[2].trim());
  }
  const rawKind = (headers.get("KIND") ?? "").toLowerCase();
  return {
    title:
      (headers.get("TITLE") ?? "").replace(/^["']|["']$/g, "").slice(0, 80) ||
      null,
    kind: KINDS.includes(rawKind) ? rawKind : null,
    topics: [
      ...new Set(
        (headers.get("TOPICS") ?? "")
          .split(",")
          .map((topic) =>
            topic
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, ""),
          )
          .filter(Boolean),
      ),
    ].slice(0, 4),
  };
}

/**
 * The application creates these on its next request; a backfill may run
 * first, and every statement here is idempotent.
 */
async function ensureColumns() {
  await sql`ALTER TABLE sync_threads ADD COLUMN IF NOT EXISTS kind TEXT`;
  await sql`ALTER TABLE sync_threads ADD COLUMN IF NOT EXISTS topics JSONB NOT NULL DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE enrichments ADD COLUMN IF NOT EXISTS kind TEXT`;
  await sql`ALTER TABLE enrichments ADD COLUMN IF NOT EXISTS topics JSONB NOT NULL DEFAULT '[]'::jsonb`;
}

async function loadThreads() {
  const threads = await sql`
    SELECT id, user_id, title, kind FROM sync_threads ORDER BY updated_at ASC
  `;
  const captures = await sql`
    SELECT id, thread_id, text, location, attachments
    FROM sync_captures ORDER BY sequence ASC
  `;
  const enrichments = await sql`
    SELECT id, thread_id, text, created_at
    FROM enrichments ORDER BY created_at ASC
  `;
  const byThread = new Map(
    threads.map((thread) => [
      thread.id,
      {
        id: thread.id,
        userId: thread.user_id,
        title: thread.title,
        kind: thread.kind ?? null,
        captures: [],
        enrichmentId: null,
        enrichmentText: "",
      },
    ]),
  );
  for (const capture of captures) byThread.get(capture.thread_id)?.captures.push(capture);
  for (const enrichment of enrichments) {
    const thread = byThread.get(enrichment.thread_id);
    if (!thread) continue;
    thread.enrichmentId = enrichment.id;
    thread.enrichmentText = enrichment.text;
  }
  return [...byThread.values()];
}

async function classify(thread) {
  const result = await generateText({
    model,
    system: SYSTEM,
    prompt: buildPrompt(thread),
  });
  return parseHeaders(result.text);
}

async function write(thread, verdict) {
  await sql`
    UPDATE sync_threads
    SET kind = ${verdict.kind}, topics = ${JSON.stringify(verdict.topics)}
    WHERE id = ${thread.id} AND user_id = ${thread.userId}
  `;
  if (thread.enrichmentId) {
    await sql`
      UPDATE enrichments
      SET kind = ${verdict.kind}, topics = ${JSON.stringify(verdict.topics)}
      WHERE id = ${thread.enrichmentId} AND user_id = ${thread.userId}
    `;
  }
  if (verdict.retitle) {
    await sql`
      UPDATE sync_threads
      SET title = ${verdict.title}
      WHERE id = ${thread.id} AND user_id = ${thread.userId}
    `;
  }
}

await ensureColumns();
const all = await loadThreads();
const pending = force ? all : all.filter((thread) => thread.kind === null);
console.log(
  `${all.length} Threads, ${pending.length} to classify with ${model}${dryRun ? " (dry run)" : ""}\n`,
);

const done = [];
for (let start = 0; start < pending.length; start += CONCURRENCY) {
  const batch = pending.slice(start, start + CONCURRENCY);
  const verdicts = await Promise.all(
    batch.map(async (thread) => {
      try {
        const verdict = await classify(thread);
        verdict.retitle =
          verdict.title !== null && isDerivedTitle(thread.title, thread.captures);
        if (!dryRun) await write(thread, verdict);
        return { thread, verdict };
      } catch (error) {
        return { thread, error: error.message };
      }
    }),
  );
  for (const entry of verdicts) {
    if (entry.error) {
      console.log(`  !! ${entry.thread.title.slice(0, 50)} — ${entry.error}`);
      continue;
    }
    done.push(entry);
    const { thread, verdict } = entry;
    const title = verdict.retitle ? `${verdict.title} (retitled)` : thread.title;
    console.log(
      `  ${(verdict.kind ?? "?").padEnd(11)} ${title.slice(0, 52).padEnd(54)} ${verdict.topics.join(" ")}`,
    );
  }
}

const counts = {};
for (const { verdict } of done) {
  counts[verdict.kind ?? "unclassified"] =
    (counts[verdict.kind ?? "unclassified"] ?? 0) + 1;
}
console.log(`\n${done.length} classified:`, counts);
