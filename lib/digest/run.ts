import {
  enrichmentSystemAndModel,
  getGatewayClient,
} from "@/lib/enrichment/gateway";
import type { GatewayClient } from "@/lib/enrichment/types";
import {
  buildDayDigestPrompt,
  DAY_DIGEST_SYSTEM_INSTRUCTION,
} from "./prompt";
import type { DayDigestRequest, DayDigestResult } from "./types";

export type DayDigestDependencies = {
  gateway?: GatewayClient;
  model?: string;
  environment?: Record<string, string | undefined>;
};

/**
 * Ask across every Capture and Enrichment from one calendar day. Reuses the
 * Enrichment gateway (Interview pattern) — not the per-Thread job queue.
 */
export async function runDayDigest(
  request: DayDigestRequest,
  deps: DayDigestDependencies = {},
): Promise<DayDigestResult> {
  const question = request.question.trim();
  if (!question) {
    throw new Error("A question is required to digest the day.");
  }
  if (request.corpus.length === 0) {
    throw new Error("No Captures for this day to digest.");
  }

  const environment = deps.environment ?? process.env;
  const gateway = deps.gateway ?? getGatewayClient(environment);
  const model = deps.model ?? enrichmentSystemAndModel(environment).model;

  const generation = await gateway.generate({
    model,
    system: DAY_DIGEST_SYSTEM_INSTRUCTION,
    prompt: buildDayDigestPrompt(request),
    requestTitle: false,
    media: [],
  });

  return {
    text: generation.text.trim(),
    model: generation.model,
  };
}
