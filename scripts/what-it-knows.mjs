/**
 * Everything the system has accumulated about the walker, in one read.
 *
 *   fnox exec --profile prod -- node scripts/what-it-knows.mjs
 *   fnox exec --profile prod -- node scripts/what-it-knows.mjs --full
 *
 * Writes nothing, ever. This is the mirror you hold up before deciding what
 * to simplify: the Memories it believes, the Projects it has coined, the
 * Kinds and Routes it sorts by, and — the part that actually explains the
 * feeling of clutter — the long tail of Topics and Mentions that each occur
 * exactly once and therefore group nothing with anything.
 *
 * --full prints every entry rather than the head of each list.
 */
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const full = args.includes("--full");
const HEAD = full ? Number.MAX_SAFE_INTEGER : 15;

const connection = process.env.DATABASE_URL;
if (!connection) {
  console.error(
    "DATABASE_URL is not set. Run through fnox:\n" +
      "  fnox exec --profile prod -- node scripts/what-it-knows.mjs",
  );
  process.exit(1);
}

const sql = neon(connection);

function heading(text) {
  console.log(`\n${text}\n${"─".repeat(text.length)}`);
}

function short(text, width = 96) {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > width ? `${flat.slice(0, width)}…` : flat;
}

function tally(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function printTally(rows, { total, unit }) {
  for (const [value, count] of rows.slice(0, HEAD)) {
    const share = total ? ` (${Math.round((count / total) * 100)}%)` : "";
    console.log(`  ${String(count).padStart(4)} × ${value}${share}`);
  }
  if (rows.length > HEAD) {
    console.log(`  … and ${rows.length - HEAD} more ${unit} (--full to see them)`);
  }
}

/** Replays the patch log, same rules as lib/memory/patches.ts. */
function materializeMemories(patches) {
  const memories = new Map();
  for (const patch of patches) {
    if (patch.op === "add") {
      if (patch.after_content === null) continue;
      memories.set(patch.memory_id, {
        id: patch.memory_id,
        category: patch.category,
        content: patch.after_content,
        source: patch.source,
        createdAt: patch.created_at,
      });
    } else if (patch.op === "update") {
      const current = memories.get(patch.memory_id);
      if (!current || patch.after_content === null) continue;
      memories.set(patch.memory_id, {
        ...current,
        category: patch.category,
        content: patch.after_content,
      });
    } else {
      memories.delete(patch.memory_id);
    }
  }
  return [...memories.values()];
}

/** Content words, for spotting two Memories that say the same thing. */
function keywords(text) {
  const stop = new Set([
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for",
    "with", "is", "are", "was", "were", "walker", "they", "their", "them",
    "he", "she", "his", "her", "it", "its", "that", "this", "has", "have",
    "at", "as", "by", "from", "who", "which", "about", "often", "likes",
  ]);
  return new Set(
    (text ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stop.has(word)),
  );
}

function overlap(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

async function main() {
  const [captures, threads, enrichments, projects, patches, artifacts] =
    await Promise.all([
      sql`SELECT id, thread_id, text, transcript, created_at, attachments FROM sync_captures`,
      sql`SELECT id, title, kind, route, reviewed_at, ask, project_id,
                 research_verdict, todo_done_at, updated_at
          FROM sync_threads`,
      sql`SELECT id, thread_id, topics, mentions, suggested_questions, draft_worthy, kind, model, created_at,
                 length(text) AS text_length,
                 jsonb_array_length(COALESCE(sources, '[]'::jsonb)) AS source_count,
                 jsonb_array_length(COALESCE(research, '[]'::jsonb)) AS research_count
          FROM enrichments`,
      sql`SELECT id, name, state, created_at, repository FROM sync_projects`,
      sql`SELECT id, op, memory_id, category, before_content, after_content, source, source_id, reverts_patch_id, created_at
          FROM memory_patches ORDER BY created_at ASC`,
      sql`SELECT thread_id, created_at FROM artifacts`,
    ]);

  const days = new Set(
    captures.map((capture) => new Date(capture.created_at).toISOString().slice(0, 10)),
  );

  heading("The corpus");
  console.log(
    `  ${captures.length} Captures · ${threads.length} Threads · ` +
      `${enrichments.length} reports · ${artifacts.length} published pages`,
  );
  console.log(`  across ${days.size} day(s) of walking`);
  const spoken = captures.filter(
    (capture) => (capture.text ?? "").trim() === "" && (capture.transcript ?? "").trim() !== "",
  ).length;
  const wordless = captures.filter(
    (capture) => (capture.text ?? "").trim() === "" && !(capture.transcript ?? "").trim(),
  ).length;
  console.log(
    `  ${spoken} spoken (transcribed) · ${wordless} carrying no words at all`,
  );

  // ── What it believes about you ──────────────────────────────────────────
  const memories = materializeMemories(patches);
  heading(`What it believes about you — ${memories.length} Memories`);
  const byCategory = new Map();
  for (const memory of memories) {
    const bucket = byCategory.get(memory.category) ?? [];
    bucket.push(memory);
    byCategory.set(memory.category, bucket);
  }
  for (const [category, entries] of [...byCategory].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.log(`\n  ${category} (${entries.length})`);
    for (const memory of entries.slice(0, HEAD)) {
      console.log(`    · ${short(memory.content)}   [${memory.source}]`);
    }
    if (entries.length > HEAD) {
      console.log(`    … and ${entries.length - HEAD} more`);
    }
  }

  const fromEnrichment = memories.filter((m) => m.source === "enrichment").length;
  const removed = patches.filter((patch) => patch.op === "remove").length;
  const updated = patches.filter((patch) => patch.op === "update").length;
  console.log(
    `\n  ${patches.length} patches wrote them: ${updated} revisions, ${removed} forgettings.`,
  );
  console.log(
    `  ${fromEnrichment} came from a report writing itself into your profile; ` +
      `${memories.length - fromEnrichment} from the Interview or by hand.`,
  );

  // Two Memories that say the same thing cost prompt budget on every report
  // and make the profile read as noise rather than a portrait.
  const words = memories.map((memory) => keywords(memory.content));
  const twins = [];
  for (let i = 0; i < memories.length; i += 1) {
    for (let j = i + 1; j < memories.length; j += 1) {
      const score = overlap(words[i], words[j]);
      if (score >= 0.6) twins.push([memories[i], memories[j], score]);
    }
  }
  if (twins.length > 0) {
    console.log(`\n  ${twins.length} pair(s) look like the same fact twice:`);
    for (const [a, b, score] of twins.slice(0, HEAD)) {
      console.log(`    ${Math.round(score * 100)}%  "${short(a.content, 60)}"`);
      console.log(`          "${short(b.content, 60)}"`);
    }
  }

  // ── Projects ────────────────────────────────────────────────────────────
  heading("Projects");
  const threadsByProject = tally(
    threads.filter((t) => t.project_id).map((t) => t.project_id),
  );
  const countFor = new Map(threadsByProject);
  for (const state of ["confirmed", "proposed", "rejected"]) {
    const mine = projects.filter((project) => project.state === state);
    console.log(`\n  ${state} (${mine.length})`);
    for (const project of mine.slice(0, HEAD)) {
      const count = countFor.get(project.id) ?? 0;
      const age = Math.round(
        (Date.now() - new Date(project.created_at).getTime()) / 86_400_000,
      );
      console.log(
        `    · ${project.name} — ${count} Thread(s), ${age}d old` +
          (project.repository ? `, repo ${project.repository}` : "") +
          (state === "proposed" && count === 0 ? "   ⚠ nothing accrued to it" : ""),
      );
    }
    if (mine.length > HEAD) console.log(`    … and ${mine.length - HEAD} more`);
  }

  // ── The two taxonomies ──────────────────────────────────────────────────
  heading("Kind — what a Thread is");
  printTally(
    tally(threads.map((thread) => thread.kind ?? "(unclassified)")),
    { total: threads.length, unit: "kinds" },
  );

  heading("Route — what you did with it");
  printTally(
    tally(threads.map((thread) => thread.route ?? "(unrouted)")),
    { total: threads.length, unit: "routes" },
  );
  const unreviewed = threads.filter((thread) => !thread.reviewed_at).length;
  const routedNotReviewed = threads.filter(
    (thread) => thread.route && !thread.reviewed_at,
  ).length;
  const reviewedNotRouted = threads.filter(
    (thread) => !thread.route && thread.reviewed_at,
  ).length;
  console.log(
    `\n  ${unreviewed} Thread(s) never settled — that is the backlog you open to.`,
  );
  console.log(
    `  Reviewed and Route disagree on ${routedNotReviewed + reviewedNotRouted} ` +
      `Thread(s) (${reviewedNotRouted} settled the old way, before Route existed).`,
  );
  const verdicts = tally(
    threads.map((thread) => thread.research_verdict ?? "(unset)"),
  );
  console.log(
    `  Research Verdict: ${verdicts.map(([v, c]) => `${c} ${v}`).join(" · ")}`,
  );

  // ── The long tails ──────────────────────────────────────────────────────
  const topics = enrichments.flatMap((entry) => entry.topics ?? []);
  const topicRows = tally(topics);
  const topicOnce = topicRows.filter(([, count]) => count === 1).length;
  heading(
    `Topics — ${topicRows.length} distinct across ${enrichments.length} reports`,
  );
  printTally(topicRows, { total: topics.length, unit: "topics" });
  console.log(
    `\n  ${topicOnce} of ${topicRows.length} occur exactly once ` +
      `(${Math.round((topicOnce / Math.max(topicRows.length, 1)) * 100)}%) — ` +
      "a topic that names one Thread groups nothing with anything.",
  );

  const mentions = enrichments.flatMap((entry) => entry.mentions ?? []);
  const mentionRows = tally(mentions.map((mention) => `${mention.name} [${mention.kind ?? "?"}]`));
  const mentionOnce = mentionRows.filter(([, count]) => count === 1).length;
  heading(`Mentions — ${mentionRows.length} distinct nouns`);
  printTally(mentionRows, { total: mentions.length, unit: "mentions" });
  console.log(
    `\n  ${mentionOnce} of ${mentionRows.length} occur exactly once ` +
      `(${Math.round((mentionOnce / Math.max(mentionRows.length, 1)) * 100)}%).`,
  );
  printTally(tally(mentions.map((mention) => mention.kind ?? "(none)")), {
    total: mentions.length,
    unit: "mention kinds",
  });

  // ── What the reports ask of you ─────────────────────────────────────────
  const openAsks = threads.filter(
    (thread) => thread.ask && !thread.reviewed_at,
  ).length;
  const suggested = enrichments.flatMap((e) => e.suggested_questions ?? []).length;
  const draftWorthy = enrichments.filter((entry) => entry.draft_worthy).length;
  heading("What it asks of you");
  console.log(`  ${openAsks} open question(s) on Threads you have not settled`);
  console.log(`  ${suggested} suggested follow-up question(s) across all reports`);
  console.log(`  ${draftWorthy} report(s) flagged as post candidates`);

  const avgLength = Math.round(
    enrichments.reduce((sum, entry) => sum + (entry.text_length ?? 0), 0) /
      Math.max(enrichments.length, 1),
  );
  const withResearch = enrichments.filter((entry) => entry.research_count > 0).length;
  console.log(
    `\n  The average report runs ${avgLength} characters; ` +
      `${withResearch} of ${enrichments.length} did any research.`,
  );

  // ── Where the clutter is ────────────────────────────────────────────────
  heading("Where the clutter is");
  const notes = [];
  if (topicOnce / Math.max(topicRows.length, 1) > 0.5) {
    notes.push(
      `Topics are mostly singletons (${topicOnce}/${topicRows.length}). They cost a facet ` +
        "group and buy almost no grouping.",
    );
  }
  const orphanProposals = projects.filter(
    (project) => project.state === "proposed" && (countFor.get(project.id) ?? 0) === 0,
  ).length;
  if (orphanProposals > 0) {
    notes.push(
      `${orphanProposals} Proposed Project(s) have no Threads — the Interview will keep asking about them.`,
    );
  }
  if (twins.length > 0) {
    notes.push(
      `${twins.length} pair(s) of near-duplicate Memories ride in every report's prompt.`,
    );
  }
  if (unreviewed > threads.length * 0.5) {
    notes.push(
      `${unreviewed} of ${threads.length} Threads are unsettled — the backlog, not the day, is what you open to.`,
    );
  }
  if (reviewedNotRouted > 0) {
    notes.push(
      `${reviewedNotRouted} Thread(s) are Reviewed with no Route: settled under the old vocabulary and ` +
        "invisible to every destination surface.",
    );
  }
  if (notes.length === 0) console.log("  Nothing stands out.");
  for (const note of notes) console.log(`  · ${note}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
