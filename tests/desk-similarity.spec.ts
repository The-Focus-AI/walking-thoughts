import { expect, test } from "@playwright/test";
import {
  cosineSimilarity,
  priorThreads,
  type SimilarityCandidate,
} from "@/lib/desk/similarity";

function candidate(
  overrides: Partial<SimilarityCandidate> & { threadId: string; at: string },
): SimilarityCandidate {
  return {
    title: `Thread ${overrides.threadId}`,
    dayKey: overrides.at.slice(0, 10),
    mentions: [],
    ...overrides,
  };
}

const RESERVOIR = { slug: "the-reservoir", name: "The reservoir" };
const OWL = { slug: "barred-owl", name: "Barred owl" };
const FROST = { slug: "frost-heave", name: "Frost heave" };

test("a shared mention makes a prior Thread, and only the past counts", () => {
  const now = candidate({
    threadId: "now",
    at: "2026-08-04T09:00:00.000Z",
    mentions: [RESERVOIR, OWL],
  });
  const candidates = [
    now,
    candidate({
      threadId: "march",
      at: "2026-03-01T09:00:00.000Z",
      mentions: [RESERVOIR],
    }),
    candidate({
      threadId: "later",
      at: "2026-08-05T09:00:00.000Z",
      mentions: [RESERVOIR, OWL],
    }),
    candidate({
      threadId: "unrelated",
      at: "2026-01-01T09:00:00.000Z",
      mentions: [{ slug: "cornwall-market", name: "Cornwall Market" }],
    }),
  ];

  const priors = priorThreads({ thread: now, candidates });
  // Not itself, not tomorrow's walk, not a Thread with nothing in common.
  expect(priors.map((prior) => prior.threadId)).toEqual(["march"]);
  expect(priors[0].sharedMentions).toEqual(["The reservoir"]);
  expect(priors[0].via).toBe("mention");
});

test("more shared nouns rank higher, then the more recent walk", () => {
  const now = candidate({
    threadId: "now",
    at: "2026-08-04T09:00:00.000Z",
    mentions: [RESERVOIR, OWL, FROST],
  });
  const candidates = [
    now,
    candidate({
      threadId: "one-old",
      at: "2026-02-01T09:00:00.000Z",
      mentions: [RESERVOIR],
    }),
    candidate({
      threadId: "one-recent",
      at: "2026-07-30T09:00:00.000Z",
      mentions: [OWL],
    }),
    candidate({
      threadId: "two",
      at: "2026-05-01T09:00:00.000Z",
      mentions: [RESERVOIR, FROST],
    }),
  ];

  expect(
    priorThreads({ thread: now, candidates }).map((prior) => prior.threadId),
  ).toEqual(["two", "one-recent", "one-old"]);
});

test("an exact link always outranks a resemblance, and never doubles it", () => {
  const now = candidate({
    threadId: "now",
    at: "2026-08-04T09:00:00.000Z",
    mentions: [RESERVOIR],
  });
  const candidates = [
    now,
    candidate({
      threadId: "shares-mention",
      at: "2026-06-01T09:00:00.000Z",
      mentions: [RESERVOIR],
    }),
    candidate({ threadId: "reads-alike", at: "2026-06-02T09:00:00.000Z" }),
  ];

  const priors = priorThreads({
    thread: now,
    candidates,
    // The embedding likes the resemblance more; the exact link still wins.
    embeddingMatches: [
      { threadId: "reads-alike", score: 0.94 },
      { threadId: "shares-mention", score: 0.71 },
    ],
  });

  expect(priors.map((prior) => prior.threadId)).toEqual([
    "shares-mention",
    "reads-alike",
  ]);
  expect(priors[0].via).toBe("mention");
  expect(priors[1].via).toBe("embedding");
  expect(priors[1].score).toBe(0.94);
});

test("a Thread the corpus has never seen has no priors, and that is fine", () => {
  const now = candidate({
    threadId: "now",
    at: "2026-08-04T09:00:00.000Z",
    mentions: [OWL],
  });
  expect(priorThreads({ thread: now, candidates: [now] })).toEqual([]);
  // An embedding match that is not in the pile cannot be shown either.
  expect(
    priorThreads({
      thread: now,
      candidates: [now],
      embeddingMatches: [{ threadId: "ghost", score: 0.99 }],
    }),
  ).toEqual([]);
});

test("cosine similarity is honest about vectors it cannot compare", () => {
  expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  // Different spaces, or nothing at all, are not similar to anything.
  expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  expect(cosineSimilarity([], [])).toBe(0);
  expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
});
