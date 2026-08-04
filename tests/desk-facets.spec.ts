import { expect, test } from "@playwright/test";
import {
  facetCounts,
  facetHref,
  filterThreads,
  hasFacets,
  matchesFacets,
  readFacets,
  readLens,
  stackByLens,
  toggleFacet,
  type FacetThread,
} from "@/lib/desk/facets";

function thread(overrides: Partial<FacetThread> & { id: string }): FacetThread {
  return {
    dayKey: "2026-08-01",
    kind: null,
    reviewed: false,
    researchVerdict: null,
    needsWord: false,
    needsAttention: false,
    projectId: null,
    projectName: null,
    mentions: [],
    mediaKinds: [],
    hasReport: false,
    hasEnrichment: false,
    ...overrides,
  };
}

const PILE: FacetThread[] = [
  thread({
    id: "t-question",
    kind: "question",
    hasReport: true,
    hasEnrichment: true,
    projectId: "p-umwelten",
    projectName: "Umwelten",
  }),
  thread({
    id: "t-question-filed",
    kind: "question",
    reviewed: true,
    researchVerdict: "kept",
    hasEnrichment: true,
    dayKey: "2026-07-31",
  }),
  thread({
    id: "t-task",
    kind: "task",
    needsWord: true,
    mediaKinds: ["image"],
    hasEnrichment: true,
  }),
  thread({
    id: "t-place",
    kind: "place",
    reviewed: true,
    dayKey: "2026-07-31",
    mediaKinds: ["audio"],
  }),
];

test("a facet narrows to its own Threads and the counts say how many", () => {
  const selection = { kind: "question" };
  const kept = filterThreads(PILE, selection);
  expect(kept.map((entry) => entry.id)).toEqual([
    "t-question",
    "t-question-filed",
  ]);

  const counts = facetCounts(PILE, selection, [
    { id: "p-umwelten", name: "Umwelten" },
  ]);
  // A group's own selection never narrows its own counts — the rail says
  // what switching rows inside the group would give.
  expect(counts.kind.question).toBe(2);
  expect(counts.kind.task).toBe(1);
  // Other groups recompute against the active Kind.
  expect(counts.state.open).toBe(1);
  expect(counts.state.reviewed).toBe(1);
  expect(counts.state.kept).toBe(1);
  expect(counts.media.photos).toBe(0);
});

test("groups combine, and each group's counts recompute against the rest", () => {
  const selection = { kind: "question", state: "open" };
  expect(filterThreads(PILE, selection).map((entry) => entry.id)).toEqual([
    "t-question",
  ]);

  const counts = facetCounts(PILE, selection);
  // Kind counts now see only open Threads.
  expect(counts.kind.question).toBe(1);
  expect(counts.kind.task).toBe(1);
  expect(counts.kind.place).toBe(0);
  // Nothing open has audio, so that row is a zero the rail will disable.
  expect(counts.media.audio).toBe(0);
  expect(counts.reports.full).toBe(1);
});

test("a Lens re-stacks the same set without changing its membership", () => {
  const selection = {};
  const kept = filterThreads(PILE, selection);
  const membership = (lens: Parameters<typeof stackByLens>[1]) =>
    stackByLens(kept, lens)
      .flatMap((stack) => stack.threadIds)
      .sort();

  const days = stackByLens(kept, "days");
  expect(days.map((stack) => stack.key)).toEqual(["2026-08-01", "2026-07-31"]);
  expect(membership("days")).toEqual(membership("kind"));
  expect(membership("days")).toEqual(membership("media"));
  expect(membership("days")).toEqual(membership("topics"));
  expect(membership("days")).toEqual(membership("reports"));

  // Kind stacks follow the desk order, unclassified last.
  expect(stackByLens(kept, "kind").map((stack) => stack.key)).toEqual([
    "task",
    "question",
    "place",
  ]);
  // Topics is Project plus an unfiled bucket until mentions exist.
  expect(stackByLens(kept, "topics").map((stack) => stack.key)).toEqual([
    "p-umwelten",
    "unfiled",
  ]);
});

test("the selection round-trips through the URL, and legacy ?f= lands on it", () => {
  const href = facetHref("/days", { kind: "question", state: "open" }, "kind");
  expect(href).toBe("/days?state=open&kind=question&lens=kind");

  const params = new URLSearchParams(href.split("?")[1]);
  expect(readFacets(params)).toEqual({ state: "open", kind: "question" });
  expect(readLens(params)).toBe("kind");

  // The shipped chips: the sync pill, the day sheet's answer count, and the
  // media chip all keep working, translated into the newer model.
  expect(readFacets(new URLSearchParams("f=word"))).toEqual({
    attention: "word",
  });
  expect(readFacets(new URLSearchParams("f=attention"))).toEqual({
    attention: "stuck",
  });
  expect(readFacets(new URLSearchParams("f=reports"))).toEqual({
    reports: "full",
  });
  expect(readFacets(new URLSearchParams("f=media"))).toEqual({ media: "any" });

  // Nonsense narrows nothing rather than emptying the desk.
  expect(readFacets(new URLSearchParams("kind=sasquatch"))).toEqual({});
  expect(hasFacets(readFacets(new URLSearchParams("kind=sasquatch")))).toBe(
    false,
  );
  expect(readLens(new URLSearchParams("lens=telescope"))).toBe("days");
});

test("choosing the active row in a group clears that group", () => {
  const selection = { kind: "question", state: "open" };
  expect(toggleFacet(selection, "kind", "question")).toEqual({ state: "open" });
  expect(toggleFacet(selection, "kind", "task")).toEqual({
    kind: "task",
    state: "open",
  });
});

test("media and reports read the Thread's own contents", () => {
  const photo = thread({ id: "t", mediaKinds: ["image", "audio"] });
  expect(matchesFacets(photo, { media: "photos" })).toBe(true);
  expect(matchesFacets(photo, { media: "audio" })).toBe(true);
  expect(matchesFacets(photo, { media: "any" })).toBe(true);
  expect(matchesFacets(photo, { media: "text" })).toBe(false);

  const quick = thread({ id: "q", hasEnrichment: true });
  expect(matchesFacets(quick, { reports: "quick" })).toBe(true);
  expect(matchesFacets(quick, { reports: "full" })).toBe(false);

  const full = thread({ id: "f", hasEnrichment: true, hasReport: true });
  expect(matchesFacets(full, { reports: "full" })).toBe(true);
  expect(matchesFacets(full, { reports: "quick" })).toBe(false);

  // A Thread with both a photo and a clip stacks once, under the stronger.
  expect(stackByLens([photo], "media").map((stack) => stack.key)).toEqual([
    "photos",
  ]);
});
