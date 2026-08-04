/**
 * What came before this Thread. Two ways of knowing, in that order:
 *
 * 1. A **shared mention** — both Threads name the same noun. This is exact,
 *    explainable ("both mention the reservoir"), and needs no model.
 * 2. **Embedding similarity** — the Threads read alike without naming the
 *    same thing. A fallback, and always ranked under an exact link, because
 *    a walker can check a shared name and cannot check a cosine.
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
  mentions: Array<{ slug: string; name: string }>;
};

export type PriorThread = {
  threadId: string;
  title: string;
  dayKey: string;
  /** How this one surfaced; an exact link always outranks a resemblance. */
  via: "mention" | "embedding";
  /** The nouns both Threads name, in the order this Thread names them. */
  sharedMentions: string[];
  /** Cosine similarity, for embedding matches only. */
  score?: number;
};

export type EmbeddingMatch = { threadId: string; score: number };

/**
 * The prior Threads for one Thread, shared-mention links first. Embedding
 * matches that are already linked by a mention are folded into the exact
 * entry rather than repeated — the walker sees one row per prior Thread.
 */
export function priorThreads(input: {
  thread: SimilarityCandidate;
  candidates: SimilarityCandidate[];
  embeddingMatches?: EmbeddingMatch[];
  limit?: number;
}): PriorThread[] {
  const { thread, candidates } = input;
  const limit = input.limit ?? 5;
  const mineBySlug = new Map(
    thread.mentions.map((mention) => [mention.slug, mention.name]),
  );

  const earlier = candidates.filter(
    (candidate) =>
      candidate.threadId !== thread.threadId && candidate.at < thread.at,
  );

  const byMention: PriorThread[] = [];
  for (const candidate of earlier) {
    const shared: string[] = [];
    for (const mention of candidate.mentions) {
      const name = mineBySlug.get(mention.slug);
      if (name && !shared.includes(name)) shared.push(name);
    }
    if (shared.length === 0) continue;
    byMention.push({
      threadId: candidate.threadId,
      title: candidate.title,
      dayKey: candidate.dayKey,
      via: "mention",
      sharedMentions: shared,
    });
  }
  // The strongest link first — most nouns in common — then the most recent,
  // because a walk last week is worth more than the same walk in March.
  byMention.sort(
    (a, b) =>
      b.sharedMentions.length - a.sharedMentions.length ||
      (a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0),
  );

  const linked = new Set(byMention.map((entry) => entry.threadId));
  const byEmbedding: PriorThread[] = [];
  for (const match of [...(input.embeddingMatches ?? [])].sort(
    (a, b) => b.score - a.score,
  )) {
    if (linked.has(match.threadId)) continue;
    const candidate = earlier.find(
      (entry) => entry.threadId === match.threadId,
    );
    if (!candidate) continue;
    byEmbedding.push({
      threadId: candidate.threadId,
      title: candidate.title,
      dayKey: candidate.dayKey,
      via: "embedding",
      sharedMentions: [],
      score: match.score,
    });
  }

  return [...byMention, ...byEmbedding].slice(0, limit);
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
