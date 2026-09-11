/**
 * User-facing copy for data handling, sync honesty, and offline limits.
 * Keep product claims aligned with the architecture (no E2E encryption).
 */

export const DATA_HANDLING_TITLE = "How synchronized data is handled";

export const DATA_HANDLING_BODY =
  "When you sync, Capture text and photos leave this device and are processed through Mycel by GLM-5.3-Flash. Audio transcription, video Enrichment, and similar-Thread suggestions are currently unavailable while open-source suppliers are being verified. Recordings remain preserved; Threads that need transcription wait rather than losing their audio. Walking Thoughts does not claim end-to-end encryption for synchronized content.";

export const TRANSCRIPTION_UNAVAILABLE =
  "Audio transcription is currently unavailable. Your recording is preserved; this Thread will wait until transcription is available.";

export const SIMILARITY_UNAVAILABLE =
  "Similar-Thread suggestions are currently unavailable.";

export const FOREGROUND_SYNC_IDLE =
  "Foreground sync when open and online (background is best effort)";

export const FOREGROUND_SYNC_RUNNING = "Foreground sync running…";

export const OFFLINE_CAPTURE_PROMISE =
  "Offline: Captures stay on this device. Sync, Enrichment, and push wait for connectivity — local commits are never discarded because a remote step is unavailable.";
