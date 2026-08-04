import { priorThreads, type PriorThread } from "@/lib/desk/similarity";
import { embeddableText, type EmbeddingClient } from "./embeddings";
import type { EnrichmentMention, EnrichmentRepository } from "./types";

/**
 * Research that does not start cold. Before a report is written, the walk's
 * own past is retrieved into the prompt: the Threads that named the same
 * nouns first, then the ones that merely read alike.
 *
 * Everything here is best-effort. Retrieval is a head start, never a
 * precondition: a failure must produce the same cold-start report the app
 * wrote yesterday, not a failed job.
 */

/**
 * The Thread being enriched has no mentions of its own — it earns them from
 * the report about to be written — so on a first Capture "same mention
 * first" could never fire. The walker's own words stand in: a noun the
 * corpus already knows, appearing whole in what they just said, is the same
 * exact link a stored mention would have been.
 *
 * Short names are skipped; a two-letter noun matches everything and means
 * nothing.
 */
export function mentionsInText(
  known: EnrichmentMention[],
  texts: string[],
): EnrichmentMention[] {
  const haystack = texts.join("\n").toLowerCase();
  const found = new Map<string, EnrichmentMention>();
  for (const mention of known) {
    const name = mention.name.trim().toLowerCase();
    if (name.length < 4 || found.has(mention.slug)) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack)) {
      found.set(mention.slug, mention);
    }
  }
  return [...found.values()];
}

/**
 * What this walk already worked out about the same things. The Thread being
 * enriched has no stored embedding yet — it earns one after its report
 * lands — so the fallback embeds the Capture text here and asks the index
 * with that, rather than looking itself up and finding nothing.
 */
export async function retrievePriorThreads(input: {
  userId: string;
  repository: EnrichmentRepository;
  embeddings?: EmbeddingClient;
  threadId: string;
  /** The words being enriched, for the embedding fallback. */
  captureTexts: string[];
  /** What this Thread's newest Enrichment already named, when it has one. */
  mentions: EnrichmentMention[];
  limit?: number;
}): Promise<PriorThread[]> {
  const limit = input.limit ?? 3;
  try {
    if (!input.repository.listThreadMentionIndex) return [];
    const index = await input.repository.listThreadMentionIndex(input.userId);
    const mine = index.find((entry) => entry.threadId === input.threadId);

    // Its own mentions when it has them, else the nouns the corpus already
    // knows that the walker just used.
    const myMentions =
      input.mentions.length > 0
        ? input.mentions
        : mentionsInText(
            index
              .filter((entry) => entry.threadId !== input.threadId)
              .flatMap((entry) => entry.mentions),
            input.captureTexts,
          );

    const embeddingMatches = await retrieveByVector(input);

    return priorThreads({
      thread: {
        threadId: input.threadId,
        title: mine?.title ?? "",
        dayKey: (mine?.at ?? new Date().toISOString()).slice(0, 10),
        // The Thread being written is the newest thing there is, so
        // everything already in the index counts as prior to it.
        at: mine?.at ?? new Date().toISOString(),
        mentions: myMentions.map((mention) => ({
          slug: mention.slug,
          name: mention.name,
        })),
      },
      candidates: index.map((entry) => ({
        threadId: entry.threadId,
        title: entry.title,
        dayKey: entry.at.slice(0, 10),
        at: entry.at,
        mentions: entry.mentions.map((mention) => ({
          slug: mention.slug,
          name: mention.name,
        })),
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
 * How the retrieved past reaches the model: named Threads with the reason
 * each one is here, and a plain instruction to build on them and say so.
 * Empty when nothing was retrieved, so a first Capture's prompt is exactly
 * the prompt it would have had before any of this existed.
 */
export function formatPriorThreads(priors: PriorThread[]): string | null {
  if (priors.length === 0) return null;
  const lines = priors.map((prior) => {
    const why =
      prior.via === "mention"
        ? `shares ${prior.sharedMentions.join(", ")}`
        : "reads alike";
    return `- [thread ${prior.threadId}${
      prior.dayKey ? `, walked ${prior.dayKey}` : ""
    }; ${why}] ${prior.title}`;
  });
  return [
    "Earlier Threads from this walker's own history, most related first. Build on what they already established rather than starting cold, and say plainly which one you are building on when you use it. Do not repeat their findings back as new.",
    ...lines,
  ].join("\n");
}
