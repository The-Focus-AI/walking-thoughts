import type { SpecHandoff } from "@/lib/local-capture/types";
import type { ServerThread, ThreadRepository } from "@/lib/sync/types";
import type { IssueDrafter } from "./issue-drafter";

/**
 * Settling a spec Route's handoff (ADR 0018). Runs after the filing write,
 * never instead of it: the Route and Reviewed are already committed, and
 * whatever happens here — drafted, skipped, failed — lands as one record on
 * the Thread for the receipt to read.
 */

/** The slice of the Enrichment repository the handoff needs: the reports. */
export type SpecReportSource = {
  listThreadEnrichments(
    userId: string,
    threadId: string,
  ): Promise<Array<{ text: string; kind?: string | null; createdAt: string }>>;
};

export function specHandoffKey(threadId: string): string {
  return `spec:${threadId}`;
}

/**
 * The issue body: the Enrichment's idea-shaped report — the newest one
 * judged an idea, falling back to the newest report at all, falling back to
 * the walker's own words. The key line at the bottom is what the drafter
 * searches for before ever creating a second issue.
 */
export async function specIssueBody(
  userId: string,
  thread: ServerThread,
  reports: SpecReportSource,
): Promise<string> {
  const enrichments = await reports.listThreadEnrichments(userId, thread.id);
  const ideaShaped = [...enrichments]
    .reverse()
    .find((enrichment) => enrichment.kind === "idea");
  const newest = enrichments[enrichments.length - 1];
  const report =
    ideaShaped?.text ??
    newest?.text ??
    thread.captures.map((capture) => capture.text).join("\n\n");
  return [
    report.trim(),
    "",
    "---",
    `Drafted from a Walking Thoughts spec Thread: ${thread.title}`,
    `Handoff key: ${specHandoffKey(thread.id)}`,
  ].join("\n");
}

/**
 * Route a spec Thread's handoff to its one outcome:
 *
 * - already `drafted` → that issue, always; re-routing back clears the
 *   orphan note but never drafts twice.
 * - Project missing or without a repository → `skipped`, recorded, no
 *   external write; a later routing may retry past it. A *proposed*
 *   Project skips too — only the Projects the walker confirmed count,
 *   because a proposal is not a decision.
 * - no drafter (no credential provisioned) → `skipped` as well, with its
 *   own reason: recording a fabricated draft would arm the permanent
 *   guard and silently block the real issue forever.
 * - drafter succeeds → `drafted`, the permanent guard — recorded, and
 *   returned even when the record write itself fails, so the response
 *   never disowns an issue that exists.
 * - drafter throws → `failed` with the reason, visible on the Thread; the
 *   filing itself has already committed and stays committed.
 */
export async function settleSpecHandoff(input: {
  userId: string;
  thread: ServerThread;
  threads: Pick<ThreadRepository, "listProjects" | "recordSpecHandoff">;
  reports: SpecReportSource;
  drafter: IssueDrafter | null;
  now?: string;
}): Promise<SpecHandoff> {
  const { userId, thread } = input;
  const at = input.now ?? new Date().toISOString();

  const prior = thread.specHandoff ?? null;
  if (prior?.status === "drafted") {
    if (!prior.orphanedAt) return prior;
    const restored: SpecHandoff = { ...prior, orphanedAt: null };
    await input.threads.recordSpecHandoff(userId, thread.id, restored);
    return restored;
  }

  const skip = async (
    reason: string,
    repository: string | null,
  ): Promise<SpecHandoff> => {
    const skipped: SpecHandoff = {
      status: "skipped",
      repository,
      issueUrl: null,
      issueNumber: null,
      reason,
      at,
      orphanedAt: null,
    };
    await input.threads.recordSpecHandoff(userId, thread.id, skipped);
    return skipped;
  };

  const project = thread.projectId
    ? (await input.threads.listProjects(userId)).find(
        (candidate) => candidate.id === thread.projectId,
      )
    : undefined;
  const repository = project?.repository ?? null;

  if (!repository) return skip("no_repository", null);
  if (!input.drafter) return skip("no_credential", repository);

  let drafted;
  try {
    const body = await specIssueBody(userId, thread, input.reports);
    drafted = await input.drafter.draftIssue({
      repository,
      title: thread.title,
      body,
      idempotencyKey: specHandoffKey(thread.id),
    });
  } catch (error) {
    const failed: SpecHandoff = {
      status: "failed",
      repository,
      issueUrl: null,
      issueNumber: null,
      reason: error instanceof Error ? error.message : "draft_failed",
      at,
      orphanedAt: null,
    };
    await input.threads.recordSpecHandoff(userId, thread.id, failed);
    return failed;
  }

  const record: SpecHandoff = {
    status: "drafted",
    repository: drafted.repository,
    issueUrl: drafted.url,
    issueNumber: drafted.number,
    reason: null,
    at,
    orphanedAt: null,
  };
  try {
    await input.threads.recordSpecHandoff(userId, thread.id, record);
  } catch {
    // The issue exists; the record write missed. Return the draft anyway —
    // the drafter's own key check repairs the record on the next routing
    // rather than ever drafting a second issue.
  }
  return record;
}

/**
 * Un-routing once an issue exists (ADR 0018): the issue stays — external
 * writes are never deleted — and the record notes it was orphaned so the
 * receipt can still name what exists. No-op for anything not drafted.
 */
export async function orphanSpecHandoff(input: {
  userId: string;
  thread: ServerThread;
  threads: Pick<ThreadRepository, "recordSpecHandoff">;
  now?: string;
}): Promise<SpecHandoff | null> {
  const prior = input.thread.specHandoff ?? null;
  if (prior?.status !== "drafted" || prior.orphanedAt) return prior;
  const orphaned: SpecHandoff = {
    ...prior,
    orphanedAt: input.now ?? new Date().toISOString(),
  };
  await input.threads.recordSpecHandoff(input.userId, input.thread.id, orphaned);
  return orphaned;
}
