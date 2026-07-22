import type { ThreadEnrichment } from "@/lib/enrichment/types";
import { chronologicalThreadEntries } from "@/lib/local-capture/thread-timeline";
import type { LocalCapture, LocalThread } from "@/lib/local-capture/types";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString();
}

function captureBlock(capture: LocalCapture): string {
  const lines: string[] = [`## You · ${formatWhen(capture.createdAt)}`, ""];
  if (capture.text) lines.push(capture.text, "");
  if (capture.location) {
    lines.push(
      `Location: ${capture.location.latitude.toFixed(5)}, ${capture.location.longitude.toFixed(5)}`,
      "",
    );
  }
  if (capture.attachments.length > 0) {
    lines.push(
      ...capture.attachments.map(
        (attachment) => `- ${attachment.kind}: ${attachment.fileName}`,
      ),
      "",
    );
  }
  return lines.join("\n").trimEnd();
}

function enrichmentBlock(enrichment: ThreadEnrichment): string {
  const lines: string[] = [
    `## Walking Thoughts · ${enrichment.model} · ${formatWhen(enrichment.createdAt)}`,
    "",
    enrichment.text,
    "",
  ];
  if (enrichment.sources.length > 0) {
    lines.push("### Sources", "");
    lines.push(
      ...enrichment.sources.map(
        (source, index) => `${index + 1}. [${source.title}](${source.url})`,
      ),
      "",
    );
  }
  const research = enrichment.research ?? [];
  if (research.length > 0) {
    lines.push("### Research trace", "");
    lines.push(
      ...research.map((step) =>
        step.action === "search"
          ? `- Searched (${step.provider}): “${step.query}” — ${step.resultCount} results`
          : `- Read (${step.provider}): [${step.title}](${step.url})`,
      ),
      "",
    );
  }
  return lines.join("\n").trimEnd();
}

/**
 * The whole Thread as one self-contained markdown document — what "Copy as
 * markdown" puts on the clipboard for use back at the desk.
 */
export function threadToMarkdown(input: {
  thread: LocalThread;
  captures: LocalCapture[];
  enrichments: ThreadEnrichment[];
}): string {
  const entries = chronologicalThreadEntries(input.captures, input.enrichments);
  const first = input.captures[0];
  const header = [
    `# ${input.thread.title}`,
    "",
    first ? `Captured ${formatWhen(first.createdAt)} · Walking Thoughts` : "Walking Thoughts",
    "",
  ];
  const body = entries.map((entry) =>
    entry.kind === "capture"
      ? captureBlock(entry.capture)
      : enrichmentBlock(entry.enrichment),
  );
  return [...header, ...body].join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
