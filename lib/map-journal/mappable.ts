import type { CaptureStore, LocalCapture } from "@/lib/local-capture/types";
import type { MarkerKind, MappableCapture } from "./types";

export function toMappableCapture(capture: LocalCapture): MappableCapture | null {
  if (!capture.location) return null;
  const threadId = capture.threadId ?? capture.id;
  return {
    id: capture.id,
    threadId,
    text: capture.text,
    createdAt: capture.createdAt,
    latitude: capture.location.latitude,
    longitude: capture.location.longitude,
    accuracy: capture.location.accuracy,
    status: capture.status,
    mediaKinds: capture.attachments.map((attachment) => attachment.kind),
  };
}

export async function listMappableCaptures(
  store: CaptureStore,
): Promise<MappableCapture[]> {
  const captures = await store.list();
  return captures
    .map(toMappableCapture)
    .filter((capture): capture is MappableCapture => capture != null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function markerKindFor(capture: MappableCapture): MarkerKind {
  if (capture.mediaKinds.includes("video")) return "video";
  if (capture.mediaKinds.includes("audio")) return "audio";
  if (capture.mediaKinds.includes("image")) return "image";
  return "text";
}
