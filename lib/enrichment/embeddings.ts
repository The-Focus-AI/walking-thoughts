import { embed } from "ai";

/**
 * Embedding rides the gateway like every other model choice (ADR 0004), so
 * the model is configuration rather than a constant compiled into the app:
 * `AI_GATEWAY_EMBEDDING_MODEL` names it, and the default below is what the
 * app asks for when nothing says otherwise.
 *
 * The default is a starting point, not a measured verdict — it must be
 * checked against the gateway's live `/v1/models` table before the backfill
 * runs in production, and changed there rather than here if the table
 * disagrees. Changing the model changes the vector space: existing rows
 * must be re-embedded, which is what the backfill's `--force` is for.
 */
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export function getSelectedEmbeddingModel(
  environment: Record<string, string | undefined> = process.env,
): string {
  const configured = environment.AI_GATEWAY_EMBEDDING_MODEL?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_EMBEDDING_MODEL;
}

export type EmbeddingClient = {
  model: string;
  embed(text: string): Promise<number[]>;
};

type EmbeddingGlobals = typeof globalThis & {
  __WT_EMBEDDINGS__?: EmbeddingClient;
};

/**
 * A deterministic stand-in with no network: a bag-of-words hash into a small
 * dense vector. Two texts sharing words land near each other, which is all a
 * test needs from an embedding, and local development gets similarity
 * without a gateway key.
 */
export function createFakeEmbeddingClient(dimensions = 64): EmbeddingClient {
  return {
    model: "fake/local-hash",
    async embed(text: string) {
      const vector = new Array<number>(dimensions).fill(0);
      const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
      for (const word of words) {
        let hash = 0;
        for (let index = 0; index < word.length; index += 1) {
          hash = (hash * 31 + word.charCodeAt(index)) | 0;
        }
        vector[Math.abs(hash) % dimensions] += 1;
      }
      return vector;
    },
  };
}

function createGatewayEmbeddingClient(model: string): EmbeddingClient {
  return {
    model,
    async embed(text: string) {
      const { embedding } = await embed({ model, value: text });
      return [...embedding];
    },
  };
}

/**
 * The gateway client when a key is configured, the fake otherwise. Tests and
 * local development get similarity that works; production gets the model the
 * environment names.
 */
export function getEmbeddingClient(
  environment: Record<string, string | undefined> = process.env,
): EmbeddingClient {
  const injected = (globalThis as EmbeddingGlobals).__WT_EMBEDDINGS__;
  if (injected) return injected;
  const hasGateway =
    Boolean(environment.AI_GATEWAY_API_KEY?.trim()) ||
    Boolean(environment.VERCEL_OIDC_TOKEN?.trim());
  return hasGateway
    ? createGatewayEmbeddingClient(getSelectedEmbeddingModel(environment))
    : createFakeEmbeddingClient();
}

/**
 * What a Thread is embedded from: the walker's own words first, then what
 * the Enrichment made of them. Capped, because an embedding of a 4,000-word
 * report is an embedding of its longest section.
 */
export function embeddableText(input: {
  captureTexts: string[];
  enrichmentText?: string | null;
  limit?: number;
}): string {
  const limit = input.limit ?? 4000;
  return [...input.captureTexts, input.enrichmentText ?? ""]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("\n\n")
    .slice(0, limit);
}
