import { getCaptureStore } from "@/lib/local-capture/store";
import type {
  ResearchVerdict,
  ThreadKind,
  ThreadRoute,
} from "@/lib/local-capture/types";
import { asResearchVerdict, asThreadRoute } from "@/lib/local-capture/types";
import { getReviewTransport } from "@/lib/sync/review-client";

/**
 * What Filing can settle: the Route (the primary verb — where the Thread
 * goes), the kind the Enrichment guessed, the Project, and the Research
 * Verdict. Any of them marks the Thread Reviewed; a Route also implies the
 * verdict server-side (Journal keeps, Drop dismisses — ADR 0017).
 */
export type ThreadFilingInput = {
  kind?: ThreadKind | null;
  projectId?: string | null;
  projectName?: string | null;
  researchVerdict?: ResearchVerdict | null;
  route?: ThreadRoute | null;
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
    route: filing.route,
  });
  if (!result) return false;
  // A Route settles the verdict server-side, so the local copy adopts the
  // server's verdict whenever either was part of this filing.
  const verdictSettled =
    filing.researchVerdict !== undefined || filing.route !== undefined;
  await getCaptureStore().applyThreadFiling({
    threadId,
    reviewedAt: result.reviewedAt,
    kind: (result.kind as ThreadKind | null) ?? filing.kind ?? null,
    projectId:
      filing.projectId === undefined ? undefined : (result.projectId ?? null),
    projectName: result.projectName ?? filing.projectName ?? null,
    researchVerdict: verdictSettled
      ? (asResearchVerdict(result.researchVerdict) ??
        filing.researchVerdict ??
        null)
      : undefined,
    route:
      filing.route === undefined
        ? undefined
        : (asThreadRoute(result.route) ?? filing.route ?? null),
    // The server settles what spec routing did outside the system — adopt
    // its record whenever a route was part of this filing and the server
    // actually answered with the field (ADR 0018); an older server's
    // silence must not clear a record we already hold.
    specHandoff:
      filing.route === undefined || result.specHandoff === undefined
        ? undefined
        : (result.specHandoff ?? null),
  });
  return true;
}
