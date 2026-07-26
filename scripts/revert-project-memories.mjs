/**
 * Take Projects back out of the walker profile (ADR 0014).
 *
 * Replays the Memory Patch log into the current Memory set and empties it of
 * three things: everything the retired Interview wrote, since those Memories
 * are the artifact of a mechanism ADR 0014 replaces and the walker starts
 * clean; everything that fell on the wrong side of the line ADR 0014 draws —
 * a Memory is true whether or not the walker ever acts on it, and anything
 * naming an effort, a build, a client, or a product is a Project; and any
 * survivor that merely restates another survivor.
 *
 * Removal appends an inverse patch, exactly as revertMemoryPatch does
 * (lib/memory/patches.ts). The log is never rewritten, so the Changes timeline
 * shows honestly that the system believed these were walker facts.
 *
 * Nothing is created here: the Projects this prints are the Interview's to
 * propose and the walker's to name.
 *
 *   fnox exec --profile prod -- node scripts/revert-project-memories.mjs --dry-run
 *   fnox exec --profile prod -- node scripts/revert-project-memories.mjs
 */
import { neon } from "@neondatabase/serverless";
import { generateText } from "ai";

const ROUTE_SYSTEM = [
  "You are Walking Thoughts, sorting one walker's remembered facts.",
  "A MEMORY is true about the walker whether or not they ever act on it: who they are, where they live and walk, what they know, what draws their eye, how they like their reports written.",
  "A PROJECT is work that can be finished — it names an effort, a build, a client, or a product the walker is pursuing.",
  "Answer one line per numbered fact, in order: `<n>. MEMORY` or `<n>. PROJECT: <name of the effort, at most 40 characters>`.",
  "Owning a business is a MEMORY; building a piece of software is a PROJECT.",
  "Several facts often describe the same effort. Reuse a Project name you have already written for an earlier fact rather than coining a near-duplicate — one effort, one name.",
].join(" ");

const DEDUP_SYSTEM = [
  "You are Walking Thoughts, thinning duplicate facts out of one walker's profile.",
  "Given a numbered list of remembered facts, find groups that say the same thing in different words.",
  "For each group, answer one line `KEEP <n> DROP <n>,<n>` naming the fullest, most specific fact to keep and the ones it makes redundant.",
  "The test is whether collapsing the group would change a single future report: several thin facts circling one thing are redundant even when each adds a word the others lack, so merge them into the fullest one.",
  "Prefer the keeper whose category most precisely names the fact — what the walker is belongs under identity, not place.",
  "If nothing is redundant, answer with the single word NONE.",
].join(" ");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const model = process.env.AI_GATEWAY_MODEL?.trim() || "anthropic/claude-sonnet-5";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!process.env.AI_GATEWAY_API_KEY) {
  throw new Error("AI_GATEWAY_API_KEY is required");
}
const sql = neon(databaseUrl);

/** Mirrors materializeMemories in lib/memory/patches.ts. */
function materializeMemories(patches) {
  const memories = new Map();
  for (const patch of patches) {
    if (patch.op === "add") {
      if (patch.after === null) continue;
      memories.set(patch.memoryId, {
        id: patch.memoryId,
        category: patch.category,
        content: patch.after,
        source: patch.source,
        createdAt: patch.createdAt,
      });
    } else if (patch.op === "update") {
      const current = memories.get(patch.memoryId);
      if (!current || patch.after === null) continue;
      memories.set(patch.memoryId, {
        ...current,
        category: patch.category,
        content: patch.after,
      });
    } else {
      memories.delete(patch.memoryId);
    }
  }
  return [...memories.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1,
  );
}

async function loadPatches() {
  const rows = await sql.query(
    `SELECT id, user_id, op, memory_id, category, before_content, after_content,
            source, source_id, reverts_patch_id, created_at
       FROM memory_patches
      ORDER BY created_at ASC, id ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    op: row.op,
    memoryId: row.memory_id,
    category: row.category,
    before: row.before_content,
    after: row.after_content,
    source: row.source,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }));
}

/**
 * Routes every Memory in one call so the model sees the whole profile at
 * once and names one effort once — the same reason the Enrichment is handed
 * the existing Proposed Projects instead of coining a name per Thread.
 */
async function routeMemories(memories) {
  const { text } = await generateText({
    model,
    system: ROUTE_SYSTEM,
    prompt: memories
      .map((memory, index) => `${index + 1}. (${memory.category}) ${memory.content}`)
      .join("\n"),
  });
  const routes = new Map();
  for (const match of text.matchAll(/^\s*(\d+)\.\s*(MEMORY|PROJECT:\s*(.+))\s*$/gim)) {
    const index = Number(match[1]) - 1;
    routes.set(
      index,
      match[3]
        ? { kind: "project", name: match[3].trim().slice(0, 40) }
        : { kind: "memory" },
    );
  }
  return memories.map((memory, index) => ({
    memory,
    route: routes.get(index) ?? { kind: "memory" },
  }));
}

async function findDuplicates(memories) {
  if (memories.length < 2) return new Set();
  const { text } = await generateText({
    model,
    system: DEDUP_SYSTEM,
    prompt: memories
      .map((memory, index) => `${index + 1}. (${memory.category}) ${memory.content}`)
      .join("\n"),
  });
  const drops = new Set();
  for (const match of text.matchAll(/KEEP\s+(\d+)\s+DROP\s+([\d,\s]+)/gi)) {
    const keeper = Number(match[1]) - 1;
    for (const raw of match[2].split(",")) {
      const index = Number(raw.trim()) - 1;
      if (!Number.isInteger(index) || index === keeper) continue;
      const memory = memories[index];
      if (memory) drops.add(memory.id);
    }
  }
  return drops;
}

/** Appends the inverse of an `add`: the log stays append-only. */
async function removeMemory(userId, memory, reason) {
  await sql.query(
    `INSERT INTO memory_patches
       (id, user_id, op, memory_id, category, before_content, after_content,
        source, source_id, reverts_patch_id, created_at)
     VALUES ($1, $2, 'remove', $3, $4, $5, NULL, 'manual', $6, NULL, $7)`,
    [
      crypto.randomUUID(),
      userId,
      memory.id,
      memory.category,
      memory.content,
      reason,
      new Date().toISOString(),
    ],
  );
}

const patches = await loadPatches();
const byUser = new Map();
for (const patch of patches) {
  if (!byUser.has(patch.userId)) byUser.set(patch.userId, []);
  byUser.get(patch.userId).push(patch);
}

for (const [userId, userPatches] of byUser) {
  const memories = materializeMemories(userPatches);
  console.log(`\n${userId} — ${userPatches.length} patches, ${memories.length} live Memories`);

  const interviewed = memories.filter((memory) => memory.source === "interview");
  const learned = memories.filter((memory) => memory.source !== "interview");

  const routed = await routeMemories(learned);
  const kept = routed.filter((entry) => entry.route.kind === "memory");
  const projects = routed.filter((entry) => entry.route.kind === "project");
  const duplicates = await findDuplicates(kept.map((entry) => entry.memory));

  console.log(`\n  Projects to propose (${new Set(projects.map((p) => p.route.name)).size} distinct):`);
  for (const name of new Set(projects.map((entry) => entry.route.name))) {
    console.log(`    ${name}`);
  }

  console.log("\n  Removing as written by the retired Interview:");
  for (const memory of interviewed) {
    console.log(`    (${memory.category}) ${memory.content.slice(0, 80)}`);
  }

  console.log("\n  Removing as project-shaped:");
  for (const entry of projects) {
    console.log(`    (${entry.memory.category}) ${entry.memory.content.slice(0, 80)}`);
  }

  console.log("\n  Removing as duplicate:");
  for (const entry of kept.filter((e) => duplicates.has(e.memory.id))) {
    console.log(`    (${entry.memory.category}) ${entry.memory.content.slice(0, 80)}`);
  }

  const survivors = kept.filter((entry) => !duplicates.has(entry.memory.id));
  console.log(`\n  Keeping ${survivors.length} Memories:`);
  for (const entry of survivors) {
    console.log(`    (${entry.memory.category}) ${entry.memory.content.slice(0, 80)}`);
  }

  if (dryRun) continue;
  for (const memory of interviewed) {
    await removeMemory(userId, memory, "adr-0014-retired-interview");
  }
  for (const entry of projects) {
    await removeMemory(userId, entry.memory, "adr-0014-project-shaped");
  }
  for (const entry of kept.filter((e) => duplicates.has(e.memory.id))) {
    await removeMemory(userId, entry.memory, "adr-0014-duplicate");
  }
  console.log(
    `\n  Appended ${interviewed.length + projects.length + duplicates.size} remove patches.`,
  );
}

if (dryRun) console.log("\nDry run — nothing written.");
