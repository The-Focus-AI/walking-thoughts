/**
 * What came before this Thread: the ones that read alike, by embedding
 * similarity, most similar first.
 *
 * There used to be a second and better way — a **shared mention**, both
 * Threads naming the same noun, exact and explainable where a cosine is not.
 * It was retired with Mentions in ADR 0019, on the measurement that it could
 * not have been firing: 14 reports out of 171 emitted any mention at all,
 * against 150 of 155 Threads carrying an embedding. The ranking that put
 * exact links above resemblances is gone with it, because there is only one
 * kind of link left.
 *
 * Only the past counts: a Thread is not prior to itself, nor to anything
 * captured after it.
 */

export type SimilarityCandidate = {
  threadId: string;
  title: string;
  dayKey: string;
  /** When the Thread began — its first Capture. Decides what is "prior". */
  at: string;
};

export type PriorThread = {
  threadId: string;
  title: string;
  dayKey: string;
  /** Cosine similarity against the Thread being written. */
  score: number;
};

export type EmbeddingMatch = { threadId: string; score: number };

/** The prior Threads for one Thread, closest first. */
export function priorThreads(input: {
  thread: SimilarityCandidate;
  candidates: SimilarityCandidate[];
  embeddingMatches?: EmbeddingMatch[];
  limit?: number;
}): PriorThread[] {
  const { thread, candidates } = input;
  const limit = input.limit ?? 5;

  const earlier = candidates.filter(
    (candidate) =>
      candidate.threadId !== thread.threadId && candidate.at < thread.at,
  );

  const priors: PriorThread[] = [];
  for (const match of [...(input.embeddingMatches ?? [])].sort(
    (a, b) => b.score - a.score,
  )) {
    const candidate = earlier.find(
      (entry) => entry.threadId === match.threadId,
    );
    if (!candidate) continue;
    priors.push({
      threadId: candidate.threadId,
      title: candidate.title,
      dayKey: candidate.dayKey,
      score: match.score,
    });
  }

  return priors.slice(0, limit);
}

/**
 * Cosine similarity, for the memory repository and for ranking a pgvector
 * result the database already ordered. Vectors of different lengths, or a
 * zero vector, are simply not similar to anything.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
