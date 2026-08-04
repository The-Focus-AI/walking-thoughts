import { expect, test } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every table a query names must be a table something creates.
 *
 * The repositories are only exercised against Neon in production, so a
 * query naming a table that never existed fails silently in the places
 * built to degrade — retrieval writes a cold-start report, continuity comes
 * back empty — and the feature is simply inert with nothing to show for it.
 * That is exactly what shipped in the embedding work: `threads` and
 * `captures` for what production calls `sync_threads` and `sync_captures`.
 *
 * This reads the SQL rather than running it, so it costs no database.
 */

const ROOTS = ["lib", "scripts", "app"];
const SQL_KEYWORDS = new Set(["set", "select", "values", "only"]);
const SQL_SOURCE = /\.(ts|mjs)$/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (SQL_SOURCE.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

test("no query names a table nothing creates", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root));
  const created = new Set<string>();
  const referenced = new Map<string, string>();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    // Only inside sql`…` — prose says "from the" and "update a" constantly,
    // and a comment is not a query.
    for (const [, statement] of source.matchAll(/\bsql`([^`]*)`/g)) {
      for (const match of statement.matchAll(
        /CREATE TABLE (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)/gi,
      )) {
        created.add(match[1].toLowerCase());
      }
      for (const match of statement.matchAll(
        /\b(?:FROM|JOIN|INSERT INTO|UPDATE|ALTER TABLE|DELETE FROM)\s+([a-z_][a-z0-9_]*)/gi,
      )) {
        const table = match[1].toLowerCase();
        // `DO UPDATE SET` puts a keyword where a table name would sit.
        if (SQL_KEYWORDS.has(table)) continue;
        if (!referenced.has(table)) referenced.set(table, file);
      }
    }
  }

  // Something must have been found, or the scan itself has stopped working.
  expect(created.size).toBeGreaterThan(5);

  const missing = [...referenced.entries()]
    .filter(([table]) => !created.has(table))
    .map(([table, file]) => `${table} (first seen in ${file})`);

  expect(missing).toEqual([]);
});
