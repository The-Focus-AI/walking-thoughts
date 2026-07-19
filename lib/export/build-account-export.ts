import type { ThreadEnrichment } from "@/lib/enrichment/types";
import type { PrivateBlobStore } from "@/lib/media/memory-blob-store";
import { sha256Hex } from "@/lib/export/checksum";
import type { ServerThread } from "@/lib/sync/types";
import { renderThreadMarkdown } from "./render-markdown";
import type {
  AccountExportPackage,
  ExportAttachment,
  ExportEnrichment,
  ExportMediaFile,
  ExportThread,
} from "./types";

function safeFileName(name: string): string {
  const trimmed = name.trim() || "file";
  return trimmed.replace(/[/\\]/g, "_").replace(/^\.+/, "_");
}

function mediaExportPath(attachmentId: string, fileName: string): string {
  return `media/${attachmentId}/${safeFileName(fileName)}`;
}

async function exportAttachment(
  userId: string,
  captureId: string,
  attachment: ServerThread["captures"][number]["attachments"][number],
  blobs: PrivateBlobStore,
  media: ExportMediaFile[],
): Promise<ExportAttachment> {
  const object = await blobs.get(userId, attachment.id);
  if (!object) {
    return {
      id: attachment.id,
      kind: attachment.kind,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      byteLength: null,
      sha256: null,
      exportPath: null,
      included: false,
      sourceCaptureId: captureId,
    };
  }

  const exportPath = mediaExportPath(attachment.id, attachment.fileName);
  const sha256 = await sha256Hex(object.bytes);
  media.push({
    exportPath,
    mimeType: object.mimeType,
    bytes: object.bytes,
    sha256,
  });

  return {
    id: attachment.id,
    kind: attachment.kind,
    mimeType: object.mimeType || attachment.mimeType,
    fileName: attachment.fileName,
    byteLength: object.bytes.byteLength,
    sha256,
    exportPath,
    included: true,
    sourceCaptureId: captureId,
  };
}

function toExportEnrichment(entry: ThreadEnrichment): ExportEnrichment {
  return {
    id: entry.id,
    text: entry.text,
    model: entry.model,
    createdAt: entry.createdAt,
    basisRevision: entry.basisRevision,
    basisEntryIds: [...entry.basisEntryIds],
    targetCaptureIds: [...entry.targetCaptureIds],
    title: entry.title ?? null,
    sources: entry.sources.map((source) => ({ ...source })),
  };
}

export async function buildAccountExport(input: {
  userId: string;
  exportedAt?: string;
  threads: ServerThread[];
  enrichmentsByThreadId: Record<string, ThreadEnrichment[]>;
  blobs: PrivateBlobStore;
}): Promise<AccountExportPackage> {
  const media: ExportMediaFile[] = [];
  const threads: ExportThread[] = [];

  for (const thread of input.threads) {
    const captures = [];
    for (const capture of [...thread.captures].sort(
      (a, b) => a.sequence - b.sequence,
    )) {
      const attachments = [];
      for (const attachment of capture.attachments ?? []) {
        attachments.push(
          await exportAttachment(
            input.userId,
            capture.id,
            attachment,
            input.blobs,
            media,
          ),
        );
      }
      captures.push({
        id: capture.id,
        text: capture.text,
        createdAt: capture.createdAt,
        location: capture.location,
        sequence: capture.sequence,
        attachments,
      });
    }

    const enrichments = [...(input.enrichmentsByThreadId[thread.id] ?? [])]
      .map(toExportEnrichment)
      .sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
      );

    threads.push({
      id: thread.id,
      title: thread.title,
      revision: thread.revision,
      updatedAt: thread.updatedAt,
      captures,
      enrichments,
    });
  }

  const document = {
    version: 1 as const,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    ownerUserId: input.userId,
    threads,
  };

  const markdownByThreadId: Record<string, string> = {};
  for (const thread of threads) {
    markdownByThreadId[thread.id] = renderThreadMarkdown(thread);
  }

  return { document, markdownByThreadId, media };
}
