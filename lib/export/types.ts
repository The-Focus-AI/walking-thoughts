import type { CaptureLocation, MediaKind } from "@/lib/local-capture/types";
import type { EnrichmentSource } from "@/lib/enrichment/types";

export type ExportAttachment = {
  id: string;
  kind: MediaKind;
  mimeType: string;
  fileName: string;
  byteLength: number | null;
  sha256: string | null;
  /** Relative archive path when bytes are included; never a public URL. */
  exportPath: string | null;
  included: boolean;
  sourceCaptureId: string;
};

export type ExportCapture = {
  id: string;
  text: string;
  createdAt: string;
  location: CaptureLocation | null;
  sequence: number;
  attachments: ExportAttachment[];
};

export type ExportEnrichment = {
  id: string;
  text: string;
  model: string;
  createdAt: string;
  basisRevision: number;
  basisEntryIds: string[];
  targetCaptureIds: string[];
  title: string | null;
  sources: EnrichmentSource[];
};

export type ExportThread = {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  captures: ExportCapture[];
  enrichments: ExportEnrichment[];
};

export type AccountExportDocument = {
  version: 1;
  exportedAt: string;
  ownerUserId: string;
  threads: ExportThread[];
};

export type ExportMediaFile = {
  exportPath: string;
  mimeType: string;
  bytes: Uint8Array;
  sha256: string;
};

export type AccountExportPackage = {
  document: AccountExportDocument;
  markdownByThreadId: Record<string, string>;
  media: ExportMediaFile[];
};
