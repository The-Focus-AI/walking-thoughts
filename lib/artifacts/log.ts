import type { PublishOutcome } from "./build";
import type { CompletenessVerdict } from "./completeness";

/**
 * What publishing did, said out loud.
 *
 * The completeness floor, the retry, and the report fallback all change the
 * shape of a page silently — the walker opens a page either way — so without
 * a line here nothing downstream can tell a page that was laid out from one
 * that was salvaged. Both publish seams are also allowed to swallow their
 * failures on purpose, because a page that fails to write never fails the
 * report behind it; this is where the reason survives that.
 *
 * One line, prefixed, with the payload as JSON so a hosted log search can be
 * asked for `"outcome":"report_fallback"` directly.
 */

/** Which seam published — the queue on its own, or the walker from the desk. */
export type PublishSource = "queue" | "desk";

export type PublishLogSink = {
  log: (message: string) => void;
  error: (message: string, cause?: unknown) => void;
};

const consoleSink: PublishLogSink = {
  log: (message) => console.log(message),
  error: (message, cause) => {
    // Pass the error itself through as well, so the stack is captured
    // alongside the searchable line rather than flattened into it.
    if (cause === undefined) console.error(message);
    else console.error(message, cause);
  },
};

export function logPublishOutcome(
  entry: {
    source: PublishSource;
    threadId: string;
    outcome: PublishOutcome;
    created: boolean;
    completeness: CompletenessVerdict;
  },
  sink: PublishLogSink = consoleSink,
): void {
  sink.log(
    `artifact.publish ${JSON.stringify({
      source: entry.source,
      threadId: entry.threadId,
      outcome: entry.outcome,
      created: entry.created,
      ratio: Number(entry.completeness.ratio.toFixed(2)),
      bodyLength: entry.completeness.bodyLength,
      reportLength: entry.completeness.reportLength,
    })}`,
  );
}

export function logPublishFailure(
  entry: {
    source: PublishSource;
    threadId: string;
    error: unknown;
  },
  sink: PublishLogSink = consoleSink,
): void {
  sink.error(
    `artifact.publish.failed ${JSON.stringify({
      source: entry.source,
      threadId: entry.threadId,
      reason:
        entry.error instanceof Error
          ? entry.error.message
          : String(entry.error),
    })}`,
    entry.error,
  );
}
