/**
 * How long one `POST /api/enrichment/process` is allowed to work, and
 * how long a running claim may sit before the next drain may take it.
 *
 * Vercel's default function timeout is shorter than one Enrichment (Pro
 * 60s; Hobby lower). Production logs showed status 0 after
 * `markJobRunning` — the platform killed the invocation and the job
 * stayed `running` until the old 5-minute lease expired.
 *
 * 120s covers the 45s start budget plus one model job.
 */
export const CALL_TIME_BUDGET_MS = 45_000;

export const PROCESS_MAX_DURATION_SEC = 120;

/**
 * Client abort sits just under `maxDuration` so `request.signal` can
 * release the claim before the platform hard-kills the function.
 */
export const PROCESS_CLIENT_TIMEOUT_MS =
  (PROCESS_MAX_DURATION_SEC - 5) * 1_000;

/**
 * Just longer than `maxDuration` so a live invocation is not
 * double-claimed, and short enough that a killed one is reclaimable
 * on the next couple of 12s drains after timeout.
 */
export const RUNNING_CLAIM_LEASE_MS =
  (PROCESS_MAX_DURATION_SEC + 15) * 1_000;
