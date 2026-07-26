import type { EnrichmentSource } from "@/lib/enrichment/types";
import type { ThreadKind } from "@/lib/local-capture/types";

/**
 * An Artifact is one Enrichment published as a page: the report laid out as
 * a Quadrangle survey sheet, self-contained, and browsable on its own URL.
 * The Enrichment stays the append-only Thread entry; the Artifact is the
 * readable form of it, and only reports earn one.
 */
export type ThreadArtifact = {
  id: string;
  threadId: string;
  /** The Enrichment this page was published from. */
  enrichmentId: string;
  title: string;
  /** One line under the masthead — what the page is about. */
  standfirst: string | null;
  kind: ThreadKind | null;
  /**
   * The published page's body: sanitized HTML the model wrote against the
   * Quadrangle class vocabulary. The sheet around it is rendered on read,
   * so a design change reaches every Artifact without republishing.
   */
  body: string;
  sources: EnrichmentSource[];
  /** The gateway model that published this page. */
  model: string;
  createdAt: string;
};

/** An Artifact without its body — enough for a list, cheap to send. */
export type ArtifactSummary = Omit<ThreadArtifact, "body" | "sources">;

export type ArtifactRepository = {
  /**
   * Store a published page. Artifact ids are derived from the Enrichment, so
   * publishing the same report twice returns the stored page and reports
   * `created: false` rather than duplicating it — unless `replace` is set,
   * which is how a walker rebuilds a page whose layout has since improved.
   */
  saveArtifact(
    userId: string,
    artifact: ThreadArtifact,
    options?: { replace?: boolean },
  ): Promise<{ artifact: ThreadArtifact; created: boolean }>;
  getArtifact(userId: string, artifactId: string): Promise<ThreadArtifact | null>;
  listArtifacts(userId: string): Promise<ArtifactSummary[]>;
  listThreadArtifacts(
    userId: string,
    threadId: string,
  ): Promise<ArtifactSummary[]>;
};

/** The artifact id for an Enrichment — stable, so publishing is idempotent. */
export function artifactIdForEnrichment(enrichmentId: string): string {
  return `artifact:${enrichmentId}`;
}

export function toArtifactSummary(artifact: ThreadArtifact): ArtifactSummary {
  return {
    id: artifact.id,
    threadId: artifact.threadId,
    enrichmentId: artifact.enrichmentId,
    title: artifact.title,
    standfirst: artifact.standfirst,
    kind: artifact.kind,
    model: artifact.model,
    createdAt: artifact.createdAt,
  };
}
