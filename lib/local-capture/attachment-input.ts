import type { AttachmentInput, MediaKind } from "./types";

export function kindFromMime(mimeType: string): MediaKind {
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "image";
}

/** Build a pending AttachmentInput from a File/Blob the user picked or recorded. */
export function attachmentInputFromFile(file: Blob & { name?: string }): AttachmentInput {
  const mimeType = file.type || "application/octet-stream";
  return {
    kind: kindFromMime(mimeType),
    mimeType,
    fileName: file.name || "attachment",
    bytes: file,
  };
}
