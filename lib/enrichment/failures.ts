/**
 * When an Enrichment job may never run again. The queue requeues failed jobs
 * on every cycle, so anything the retry cannot fix has to be named here — in
 * production two classes of failure reached ~6,500 attempts each before this
 * existed.
 */

/** Source media is gone from the blob store; no retry can bring it back. */
const MISSING_MEDIA = /^missing_original_media_/;

/**
 * The job's model cannot read the attached media. Frozen at queue time, so
 * retrying this job is futile — but the same Thread becomes enrichable again
 * under a model that can (see queueJobsForThreads).
 */
const UNSUPPORTED_MEDIA = /^model_.+_unsupported_media_/;

export function isPermanentEnrichmentError(reason: string): boolean {
  return MISSING_MEDIA.test(reason) || UNSUPPORTED_MEDIA.test(reason);
}

/**
 * Backstop for failures no pattern anticipates. A transient outage deserves
 * retries; a job that has failed this many times is not coming back on its
 * own and only burns gateway budget.
 */
export const MAX_ENRICHMENT_ATTEMPTS = 25;
