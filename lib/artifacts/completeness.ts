/**
 * A published page has to be worth opening in place of the Thread. The
 * first release measured nothing, and pages came back as tidy summaries of
 * the reports they published — the walker lost detail by opening the
 * nicer-looking thing. Publishing now checks its own work.
 */

/**
 * The floor, as a fraction of the report's readable length. Below 1.0
 * because a page legitimately drops some prose the report spent on
 * transitions and framing — but a page carrying every finding, with
 * headings and a facts list on top, lands *above* the report far more often
 * than below it. Anything under this is compression, not layout.
 */
export const ARTIFACT_COMPLETENESS_FLOOR = 0.9;

/** Words a reader would actually see, with markup and markdown stripped. */
export function readableLength(value: string): number {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/[#*_`>|~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

export type CompletenessVerdict = {
  ok: boolean;
  bodyLength: number;
  reportLength: number;
  /** bodyLength / reportLength, 0 when there is no report to measure. */
  ratio: number;
};

/**
 * Whether this page carries its report. Length is a blunt proxy for
 * substance, but it catches the failure that actually happened — a page
 * that reads as a summary — and it never rejects a page for being *too*
 * thorough.
 */
export function checkArtifactCompleteness(input: {
  body: string;
  report: string;
  floor?: number;
}): CompletenessVerdict {
  const bodyLength = readableLength(input.body);
  const reportLength = readableLength(input.report);
  if (reportLength === 0) {
    return { ok: true, bodyLength, reportLength, ratio: 0 };
  }
  const ratio = bodyLength / reportLength;
  return {
    ok: ratio >= (input.floor ?? ARTIFACT_COMPLETENESS_FLOOR),
    bodyLength,
    reportLength,
    ratio,
  };
}
