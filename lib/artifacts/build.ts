import { getSelectedGatewayModel } from "@/lib/enrichment/gateway";
import type { GatewayClient, ThreadEnrichment } from "@/lib/enrichment/types";
import {
  buildPublishPrompt,
  getArtifactPublishInstruction,
  parseArtifactGeneration,
} from "./publish";
import { artifactIdForEnrichment, type ArtifactRepository, type ThreadArtifact } from "./types";

export type PublishArtifactInput = {
  userId: string;
  threadTitle: string;
  enrichment: ThreadEnrichment;
  /** The walker's own Capture words this report answered. */
  captureWords: string[];
  walkedAt?: string | null;
  repository: ArtifactRepository;
  gateway: GatewayClient;
  model?: string;
  environment?: Record<string, string | undefined>;
};

/**
 * Publish one Enrichment as an Artifact. The research is already done and
 * frozen — this pass only lays it out — so the page is written without
 * search, memory, or media, from the report's own text.
 *
 * The id is derived from the Enrichment, so publishing the same report twice
 * returns the page already stored rather than a second one.
 */
export async function publishThreadArtifact(
  input: PublishArtifactInput,
): Promise<{ artifact: ThreadArtifact; created: boolean }> {
  const environment = input.environment ?? process.env;
  const model = input.model ?? getSelectedGatewayModel(environment);
  const artifactId = artifactIdForEnrichment(input.enrichment.id);

  const existing = await input.repository.getArtifact(input.userId, artifactId);
  if (existing) return { artifact: existing, created: false };

  const generation = await input.gateway.generate({
    model,
    system: getArtifactPublishInstruction(environment),
    prompt: buildPublishPrompt({
      threadTitle: input.enrichment.title ?? input.threadTitle,
      kind: input.enrichment.kind ?? null,
      report: input.enrichment.text,
      captureWords: input.captureWords,
      sources: input.enrichment.sources,
      walkedAt: input.walkedAt ?? null,
    }),
    requestTitle: false,
    media: [],
  });

  const parsed = parseArtifactGeneration(generation.text);

  const artifact: ThreadArtifact = {
    id: artifactId,
    threadId: input.enrichment.threadId,
    enrichmentId: input.enrichment.id,
    title: input.enrichment.title ?? input.threadTitle,
    standfirst: parsed.standfirst,
    kind: input.enrichment.kind ?? null,
    body: parsed.body,
    sources: input.enrichment.sources,
    model: generation.model || model,
    createdAt: new Date().toISOString(),
  };

  return input.repository.saveArtifact(input.userId, artifact);
}
