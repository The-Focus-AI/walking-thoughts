import type { ThreadEnrichment } from "@/lib/enrichment/types";
import type { LocalCapture } from "./types";

export type ThreadTimelineEntry =
  | { kind: "capture"; capture: LocalCapture }
  | { kind: "enrichment"; enrichment: ThreadEnrichment };

/**
 * Append-only Thread stream: each Enrichment follows the highest-sequence
 * Capture its recorded basis revision included.
 */
export function chronologicalThreadEntries(
  captures: LocalCapture[],
  enrichments: ThreadEnrichment[],
): ThreadTimelineEntry[] {
  const entries: Array<{
    at: number;
    tiebreak: number;
    entry: ThreadTimelineEntry;
  }> = [
    ...captures.map((capture) => ({
      at: capture.sequence,
      tiebreak: 0,
      entry: { kind: "capture" as const, capture },
    })),
    ...enrichments.map((enrichment) => ({
      at: enrichment.basisRevision,
      tiebreak: 1,
      entry: { kind: "enrichment" as const, enrichment },
    })),
  ];
  return entries
    .sort((a, b) => a.at - b.at || a.tiebreak - b.tiebreak)
    .map((item) => item.entry);
}
