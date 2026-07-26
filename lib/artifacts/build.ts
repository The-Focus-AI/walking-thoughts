import { getSelectedGatewayModel } from "@/lib/enrichment/gateway";
import type { GatewayClient, ThreadEnrichment } from "@/lib/enrichment/types";
import {
  checkArtifactCompleteness,
  type CompletenessVerdict,
} from "./completeness";
import {
  ARTIFACT_MAX_OUTPUT_TOKENS,
  ARTIFACT_RETRY_INSTRUCTION,
  buildPublishPrompt,
  getArtifactPublishInstruction,
  parseArtifactGeneration,
} from "./publish";
import { reportToArtifactBody } from "./report-html";
import {
  artifactIdForEnrichment,
  type ArtifactRepository,
  type ThreadArtifact,
} from "./types";

export type PublishArtifactInput = {
  userId: string;
  threadTitle: string;
  enrichment: ThreadEnrichment;
  /** The walker's own Capture words this report answered. */
  captureWords: string[];
  /** Earlier Enrichments on the same Thread, oldest first. */
  priorReports?: string[];
  walkedAt?: string | null;
  repository: ArtifactRepository;
  gateway: GatewayClient;
  model?: string;
  environment?: Record<string, string | undefined>;
  /** Publish over a page already stored, rather than returning it. */
  republish?: boolean;
};

/** How a page was arrived at — the one signal worth reporting upward. */
export type PublishOutcome = "published" | "retried" | "report_fallback";

export type PublishArtifactResult = {
  artifact: ThreadArtifact;
  created: boolean;
  outcome: PublishOutcome;
  completeness: CompletenessVerdict;
};

/**
 * Publish one Enrichment as an Artifact. The research is already done and
 * frozen — this pass lays it out — so the page is written without search,
 * memory, or media, from the Thread's own text.
 *
 * The page is then held to the report: a body that comes back thinner than
 * the Enrichment it publishes is a failure, not a style, so the press is
 * asked again with the failure named, and if the second pass is still thin
 * the walker gets the report itself laid out on the sheet. An Artifact is
 * never worse than the Thread it came from.
 */
export async function publishThreadArtifact(
  input: PublishArtifactInput,
): Promise<PublishArtifactResult> {
  const environment = input.environment ?? process.env;
  const model = input.model ?? getSelectedGatewayModel(environment);
  const artifactId = artifactIdForEnrichment(input.enrichment.id);

  if (!input.republish) {
    const existing = await input.repository.getArtifact(
      input.userId,
      artifactId,
    );
    if (existing) {
      return {
        artifact: existing,
        created: false,
        outcome: "published",
        completeness: checkArtifactCompleteness({
          body: existing.body,
          report: input.enrichment.text,
        }),
      };
    }
  }

  const system = getArtifactPublishInstruction(environment);
  const prompt = buildPublishPrompt({
    threadTitle: input.enrichment.title ?? input.threadTitle,
    kind: input.enrichment.kind ?? null,
    report: input.enrichment.text,
    captureWords: input.captureWords,
    sources: input.enrichment.sources,
    walkedAt: input.walkedAt ?? null,
    priorReports: input.priorReports,
    research: input.enrichment.research,
    ask: input.enrichment.ask,
  });

  const write = async (systemInstruction: string) => {
    const generation = await input.gateway.generate({
      model,
      system: systemInstruction,
      prompt,
      requestTitle: false,
      media: [],
      maxOutputTokens: ARTIFACT_MAX_OUTPUT_TOKENS,
    });
    return {
      generation,
      parsed: parseArtifactGeneration(generation.text),
    };
  };

  let attempt = await write(system);
  let completeness = checkArtifactCompleteness({
    body: attempt.parsed.body,
    report: input.enrichment.text,
  });
  let outcome: PublishOutcome = "published";

  if (!completeness.ok) {
    const retry = await write(`${system} ${ARTIFACT_RETRY_INSTRUCTION}`);
    const retryCompleteness = checkArtifactCompleteness({
      body: retry.parsed.body,
      report: input.enrichment.text,
    });
    // Keep whichever pass carried more of the report — a retry that came
    // back thinner still is not an improvement.
    if (retryCompleteness.bodyLength > completeness.bodyLength) {
      attempt = retry;
      completeness = retryCompleteness;
    }
    outcome = "retried";
  }

  let body = attempt.parsed.body;
  let standfirst = attempt.parsed.standfirst;
  if (!completeness.ok) {
    // Both passes lost the report. Print the report.
    const fallback = reportToArtifactBody(input.enrichment.text);
    if (fallback.length > 0) {
      body = fallback;
      standfirst = null;
      outcome = "report_fallback";
      completeness = checkArtifactCompleteness({
        body,
        report: input.enrichment.text,
      });
    }
  }

  const artifact: ThreadArtifact = {
    id: artifactId,
    threadId: input.enrichment.threadId,
    enrichmentId: input.enrichment.id,
    title: input.enrichment.title ?? input.threadTitle,
    standfirst,
    kind: input.enrichment.kind ?? null,
    body,
    sources: input.enrichment.sources,
    model: attempt.generation.model || model,
    createdAt: new Date().toISOString(),
  };

  const saved = await input.repository.saveArtifact(input.userId, artifact, {
    replace: input.republish ?? false,
  });
  return { ...saved, outcome, completeness };
}
