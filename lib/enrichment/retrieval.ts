import { priorThreads, type PriorThread } from "@/lib/desk/similarity";
import { embeddableText, type EmbeddingClient } from "./embeddings";
import type { EnrichmentRepository } from "./types";

/**
 * Research that does not start cold. Before a report is written, the walk's
 * own past is retrieved into the prompt: the Threads that read like this one.
 *
 * The exact half of this — Threads that named the same noun first — was
 * retired with Mentions (ADR 0019), which the corpus showed were emitted by
 * 14 reports out of 171. What is left is the half that was doing the work.
 *
 * Everything here is best-effort. Retrieval is a head start, never a
 * precondition: a failure must produce the same cold-start report the app
 * wrote yesterday, not a failed job.
 */

/**
 * What this walk already worked out about the same things. The Thread being
 * enriched has no stored embedding yet — it earns one after its report
 * lands — so this embeds the Capture text and asks the index with that,
 * rather than looking itself up and finding nothing.
 */
export async function retrievePriorThreads(input: {
  userId: string;
  repository: EnrichmentRepository;
  embeddings?: EmbeddingClient;
  threadId: string;
  /** The words being enriched, for the embedding fallback. */
  captureTexts: string[];
  limit?: number;
}): Promise<PriorThread[]> {
  const limit = input.limit ?? 3;
  try {
    if (!input.repository.listThreadIndex) return [];
    const index = await input.repository.listThreadIndex(input.userId);
    const mine = index.find((entry) => entry.threadId === input.threadId);

    const embeddingMatches = await retrieveByVector(input);
    if (embeddingMatches.length === 0) return [];

    return priorThreads({
      thread: {
        threadId: input.threadId,
        title: mine?.title ?? "",
        dayKey: (mine?.at ?? new Date().toISOString()).slice(0, 10),
        // The Thread being written is the newest thing there is, so
        // everything already in the index counts as prior to it.
        at: mine?.at ?? new Date().toISOString(),
      },
      candidates: index.map((entry) => ({
        threadId: entry.threadId,
        title: entry.title,
        dayKey: entry.at.slice(0, 10),
        at: entry.at,
      })),
      embeddingMatches,
      limit,
    });
  } catch {
    // Cold start, exactly as before retrieval existed.
    return [];
  }
}

async function retrieveByVector(input: {
  userId: string;
  repository: EnrichmentRepository;
  embeddings?: EmbeddingClient;
  threadId: string;
  captureTexts: string[];
  limit?: number;
}): Promise<Array<{ threadId: string; score: number }>> {
  const { embeddings, repository } = input;
  if (!embeddings || !repository.findSimilarToVector) return [];
  try {
    const text = embeddableText({ captureTexts: input.captureTexts });
    if (!text) return [];
    const vector = await embeddings.embed(text);
    return await repository.findSimilarToVector(input.userId, vector, {
      model: embeddings.model,
      limit: (input.limit ?? 3) * 2,
      excludeThreadId: input.threadId,
    });
  } catch {
    // The exact links stand on their own.
    return [];
  }
}

/**
 * How the retrieved past reaches the model: named Threads and a plain
 * instruction to build on them and say so. Empty when nothing was retrieved,
 * so a first Capture's prompt is exactly the prompt it would have had before
 * any of this existed.
 */
export function formatPriorThreads(priors: PriorThread[]): string | null {
  if (priors.length === 0) return null;
  const lines = priors.map(
    (prior) =>
      `- [thread ${prior.threadId}${
        prior.dayKey ? `, walked ${prior.dayKey}` : ""
      }; reads alike] ${prior.title}`,
  );
  return [
    "Earlier Threads from this walker's own history, most related first. Build on what they already established rather than starting cold, and say plainly which one you are building on when you use it. Do not repeat their findings back as new.",
    ...lines,
  ].join("\n");
}
