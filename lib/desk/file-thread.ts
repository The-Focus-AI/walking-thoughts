import { getCaptureStore } from "@/lib/local-capture/store";
import type {
  ResearchVerdict,
  ThreadKind,
} from "@/lib/local-capture/types";
import { getReviewTransport } from "@/lib/sync/review-client";

/**
 * What Filing can settle: the kind the Enrichment guessed, the Project, and
 * the Research Verdict. Any of them marks the Thread Reviewed.
 */
export type ThreadFilingInput = {
  kind?: ThreadKind | null;
  projectId?: string | null;
  projectName?: string | null;
  researchVerdict?: ResearchVerdict | null;
};

/**
 * File a Thread and settle the local copy from the server's answer. One
 * path for every surface that files — the row's controls, the Thread page,
 * and the desk's keyboard — so they can never drift.
 *
 * Returns false when the filing could not reach the server; the caller says
 * so in its own voice.
 */
export async function fileThread(
  threadId: string,
  filing: ThreadFilingInput,
): Promise<boolean> {
  const result = await getReviewTransport().fileThread?.(threadId, {
    reviewed: true,
    kind: filing.kind,
    projectId: filing.projectId,
    researchVerdict: filing.researchVerdict,
  });
  if (!result) return false;
  await getCaptureStore().applyThreadFiling({
    threadId,
    reviewedAt: result.reviewedAt,
    kind: (result.kind as ThreadKind | null) ?? filing.kind ?? null,
    projectId:
      filing.projectId === undefined ? undefined : (result.projectId ?? null),
    projectName: result.projectName ?? filing.projectName ?? null,
    researchVerdict:
      filing.researchVerdict === undefined
        ? undefined
        : (result.researchVerdict ?? filing.researchVerdict ?? null),
  });
  return true;
}
