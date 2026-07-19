import type { ExportEnrichment, ExportThread } from "./types";

type TimelineItem =
  | { kind: "capture"; order: number; captureIndex: number }
  | { kind: "enrichment"; order: number; enrichment: ExportEnrichment };

function escapeMarkdownLinkText(text: string): string {
  return text.replace(/[[\]]/g, "\\$&");
}

export function renderThreadMarkdown(thread: ExportThread): string {
  const lines: string[] = [];
  lines.push(`# ${thread.title || "Untitled Thread"}`);
  lines.push("");
  lines.push(
    `_Thread \`${thread.id}\` · revision ${thread.revision} · updated ${thread.updatedAt}_`,
  );
  lines.push("");

  const items: TimelineItem[] = [
    ...thread.captures.map((capture, captureIndex) => ({
      kind: "capture" as const,
      order: capture.sequence,
      captureIndex,
    })),
    ...thread.enrichments.map((enrichment, index) => ({
      kind: "enrichment" as const,
      order: enrichment.basisRevision + 0.5 + index * 0.001,
      enrichment,
    })),
  ].sort((a, b) => a.order - b.order);

  for (const item of items) {
    if (item.kind === "capture") {
      const capture = thread.captures[item.captureIndex]!;
      lines.push(`## Capture ${capture.sequence}`);
      lines.push("");
      lines.push(`_Capture \`${capture.id}\` · ${capture.createdAt}_`);
      if (capture.location) {
        lines.push(
          `_Location ${capture.location.latitude}, ${capture.location.longitude} (±${capture.location.accuracy}m)_`,
        );
      }
      lines.push("");
      lines.push(capture.text);
      lines.push("");
      for (const attachment of capture.attachments) {
        if (attachment.included && attachment.exportPath) {
          const rel = `../${attachment.exportPath}`;
          if (attachment.kind === "image") {
            lines.push(`![${attachment.fileName}](${rel})`);
          } else {
            lines.push(`[${attachment.fileName}](${rel})`);
          }
          lines.push("");
          lines.push(
            `_Attachment \`${attachment.id}\` · ${attachment.mimeType} · ${attachment.byteLength ?? 0} bytes · sha256 ${attachment.sha256}_`,
          );
        } else {
          lines.push(
            `_Attachment \`${attachment.id}\` (${attachment.fileName}) was not available in synchronized storage at export time._`,
          );
        }
        lines.push("");
      }
      continue;
    }

    const enrichment = item.enrichment;
    lines.push("## Enrichment");
    lines.push("");
    lines.push(
      `_Enrichment \`${enrichment.id}\` · model \`${enrichment.model}\` · basis revision ${enrichment.basisRevision} · ${enrichment.createdAt}_`,
    );
    lines.push("");
    lines.push(enrichment.text);
    lines.push("");
    if (enrichment.sources.length > 0) {
      lines.push("### Sources");
      lines.push("");
      for (const source of enrichment.sources) {
        lines.push(
          `- [${escapeMarkdownLinkText(source.title)}](${source.url}) _(retrieved ${source.retrievedAt})_`,
        );
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
