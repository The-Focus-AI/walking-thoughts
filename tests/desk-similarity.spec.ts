import { expect, test } from "@playwright/test";
import {
  cosineSimilarity,
  priorThreads,
  type SimilarityCandidate,
} from "@/lib/desk/similarity";

/**
 * What came before a Thread, by resemblance alone. The shared-mention half
 * of this was retired with Mentions (ADR 0019); what these hold is the half
 * that was doing the work — closest first, past only.
 */

function candidate(
  overrides: Partial<SimilarityCandidate> & { threadId: string; at: string },
): SimilarityCandidate {
  return {
    title: `Thread ${overrides.threadId}`,
    dayKey: overrides.at.slice(0, 10),
    ...overrides,
  };
}

test("the closest earlier Threads come back, closest first", () => {
  const now = candidate({ threadId: "now", at: "2026-08-04T09:00:00.000Z" });
  const candidates = [
    now,
    candidate({ threadId: "march", at: "2026-03-01T09:00:00.000Z" }),
    candidate({ threadId: "june", at: "2026-06-01T09:00:00.000Z" }),
  ];

  const priors = priorThreads({
    thread: now,
    candidates,
    embeddingMatches: [
      { threadId: "march", score: 0.71 },
      { threadId: "june", score: 0.94 },
    ],
  });

  expect(priors.map((prior) => prior.threadId)).toEqual(["june", "march"]);
  expect(priors[0].score).toBe(0.94);
});

test("a Thread is never prior to itself, nor is a later walk", () => {
  const now = candidate({ threadId: "now", at: "2026-08-04T09:00:00.000Z" });
  const candidates = [
    now,
    candidate({ threadId: "tomorrow", at: "2026-08-05T09:00:00.000Z" }),
  ];

  expect(
    priorThreads({
      thread: now,
      candidates,
      // The index will happily match both; only the past may be returned.
      embeddingMatches: [
        { threadId: "now", score: 1 },
        { threadId: "tomorrow", score: 0.99 },
      ],
    }),
  ).toEqual([]);
});

test("a Thread the corpus has never seen has no priors, and that is fine", () => {
  const now = candidate({ threadId: "now", at: "2026-08-04T09:00:00.000Z" });
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
