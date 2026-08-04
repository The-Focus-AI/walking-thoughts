import { expect, test } from "@playwright/test";
import { matchesQuery, searchSnippet } from "@/lib/desk/search";

const REPORT =
  "Remotion renders video from React components, so a programmatic edit is a " +
  "code change rather than a timeline drag. The trade-off is render time.";

test("a search matches any text the Thread holds, whoever wrote it", () => {
  expect(matchesQuery(["Making videos"], "remotion")).toBe(false);
  expect(matchesQuery(["Making videos", REPORT], "remotion")).toBe(true);
  // Case and surrounding words do not matter; an empty query matches nothing.
  expect(matchesQuery([REPORT], "REACT COMPONENTS")).toBe(true);
  expect(matchesQuery([REPORT], "   ")).toBe(false);
});

test("the snippet is the matched line, cut at words and marked where it was cut", () => {
  const snippet = searchSnippet(["Making videos", REPORT], "programmatic", 40)!;
  expect(snippet).toContain("programmatic");
  expect(snippet.startsWith("…")).toBe(true);
  expect(snippet.endsWith("…")).toBe(true);
  // Cut at a word boundary, never mid-word.
  expect(snippet.replace(/^…/, "").startsWith(" ")).toBe(false);
  expect(snippet).not.toContain("  ");

  // A short text needs no cutting at all.
  expect(searchSnippet(["Barred owl at dusk"], "owl")).toBe(
    "Barred owl at dusk",
  );
  expect(searchSnippet([REPORT], "sasquatch")).toBeNull();
});
