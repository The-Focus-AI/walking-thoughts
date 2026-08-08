/**
 * The one edit the walker makes at a Timeline strip: taking a frame off it.
 * The removal is a surface decision, not a Thread one — the Capture and its
 * Thread stay exactly as they were, so the record lives beside the map
 * journal on this device rather than on the filing seam.
 */
const STORAGE_KEY = "walking-thoughts:timeline-removed-frames";

function readStored(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function removedFrameCaptureIds(): Set<string> {
  return new Set(readStored());
}

export function removeFrame(captureId: string): Set<string> {
  const ids = new Set(readStored());
  ids.add(captureId);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage full or unavailable: the strip still updates for this visit.
  }
  return ids;
}
