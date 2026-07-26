import type { ThreadKind } from "@/lib/local-capture/types";

/**
 * Only reports earn an Artifact. The Enrichment registers in
 * `lib/enrichment/system-instruction.ts` are deliberately unequal: a
 * question earns a full cited report and an idea earns a sharpened
 * write-up, while a task is three sentences, an observation is a reply, and
 * noise is one line. Publishing a page for those would dress up something
 * that was never a page — a "REPORT" masthead over "Call the stone yard."
 */
const REPORT_KINDS = new Set<ThreadKind>(["question", "idea"]);

/** A report is a report at about this length; below it, the Thread suffices. */
export const ARTIFACT_MIN_REPORT_LENGTH = 600;

/**
 * An unclassified Enrichment gets the benefit of the doubt only when it is
 * long enough that it plainly *is* a report, whatever the model failed to
 * call it.
 */
export const ARTIFACT_MIN_UNCLASSIFIED_LENGTH = 1_400;

export function earnsArtifact(enrichment: {
  kind?: ThreadKind | null;
  text: string;
}): boolean {
  const length = enrichment.text.trim().length;
  if (!enrichment.kind) return length >= ARTIFACT_MIN_UNCLASSIFIED_LENGTH;
  if (!REPORT_KINDS.has(enrichment.kind)) return false;
  return length >= ARTIFACT_MIN_REPORT_LENGTH;
}
