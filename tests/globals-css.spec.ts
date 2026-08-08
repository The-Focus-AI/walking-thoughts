import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * One dropped brace in globals.css silently swallows every rule after it as
 * declarations of the unterminated block. Nothing errors: the build passes,
 * the page renders, and whole features come out unstyled — which is exactly
 * how the Day flow and the Field Manual both shipped naked after an
 * append-vs-append merge. The stylesheet has no type checker, so it gets
 * this one.
 */

const CSS_PATH = join(process.cwd(), "app", "globals.css");

/** Braces outside comments and strings — the only ones that nest a rule. */
function structuralBraces(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

test("globals.css braces balance, so no rule is swallowed by an earlier one", () => {
  const source = structuralBraces(readFileSync(CSS_PATH, "utf8"));

  let depth = 0;
  let line = 1;
  for (const character of source) {
    if (character === "\n") line += 1;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      expect(depth, `unmatched "}" at globals.css:${line}`).toBeGreaterThanOrEqual(0);
    }
  }

  expect(depth, `${depth} unclosed block(s) — every rule after the first one is dead`).toBe(0);
});

/**
 * Balanced braces alone would still pass if a whole feature's rules sat
 * inside a media query by accident, so name the surfaces that must be
 * reachable at the top level.
 */
test("each surface's rules sit at the top level, not nested in another block", () => {
  const css = readFileSync(CSS_PATH, "utf8");

  for (const selector of [
    ".manual-sheet {",
    ".day-flow {",
    ".todo-items {",
    ".shell {",
  ]) {
    const index = css.indexOf(selector);
    expect(index, `${selector} is missing from globals.css`).toBeGreaterThan(-1);

    const before = structuralBraces(css.slice(0, index));
    const depth =
      before.split("{").length - 1 - (before.split("}").length - 1);
    expect(depth, `${selector} is nested ${depth} level(s) deep`).toBe(0);
  }
});
