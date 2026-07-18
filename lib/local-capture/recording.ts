export const AUDIO_LIMIT_MS = 10 * 60 * 1000;
export const VIDEO_LIMIT_MS = 2 * 60 * 1000;

export type RecordingKind = "audio" | "video";

export type RecordingResult = {
  kind: RecordingKind;
  mimeType: string;
  fileName: string;
  bytes: Blob;
  durationMs: number;
  hitLimit: boolean;
};

type RecorderDeps = {
  mediaDevices?: MediaDevices;
  MediaRecorderCtor?: typeof MediaRecorder;
  now?: () => number;
};

export function createRecorder(deps: RecorderDeps = {}) {
  const mediaDevices = deps.mediaDevices ?? navigator.mediaDevices;
  const MediaRecorderCtor = deps.MediaRecorderCtor ?? MediaRecorder;
  const now = deps.now ?? (() => Date.now());

  return {
    async record(
      kind: RecordingKind,
      options: { signal?: AbortSignal; maxMs?: number } = {},
    ): Promise<RecordingResult> {
      const maxMs = options.maxMs ?? (kind === "audio" ? AUDIO_LIMIT_MS : VIDEO_LIMIT_MS);
      const constraints =
        kind === "audio"
          ? { audio: true }
          : { audio: true, video: { facingMode: "environment" } };
      const stream = await mediaDevices.getUserMedia(constraints);
      const mimeType =
        kind === "audio"
          ? pickMimeType(["audio/webm", "audio/mp4"], MediaRecorderCtor)
          : pickMimeType(["video/webm", "video/mp4"], MediaRecorderCtor);

      const recorder = new MediaRecorderCtor(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      const chunks: Blob[] = [];
      const startedAt = now();
      let hitLimit = false;

      const stop = () => {
        if (recorder.state !== "inactive") recorder.stop();
        for (const track of stream.getTracks()) track.stop();
      };

      const limitTimer = globalThis.setTimeout(() => {
        hitLimit = true;
        stop();
      }, maxMs);

      options.signal?.addEventListener("abort", () => {
        globalThis.clearTimeout(limitTimer);
        stop();
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      const blob = await new Promise<Blob>((resolve, reject) => {
        recorder.onerror = () => reject(new Error("recording_failed"));
        recorder.onstop = () => {
          globalThis.clearTimeout(limitTimer);
          resolve(
            new Blob(chunks, {
              type: mimeType || chunks[0]?.type || "application/octet-stream",
            }),
          );
        };
        recorder.start();
      });

      const durationMs = Math.max(0, now() - startedAt);
      const extension = (blob.type.includes("mp4") ? "mp4" : "webm") as string;
      return {
        kind,
        mimeType: blob.type || (kind === "audio" ? "audio/webm" : "video/webm"),
        fileName: `${kind}-${startedAt}.${extension}`,
        bytes: blob,
        durationMs,
        hitLimit,
      };
    },
  };
}

function pickMimeType(
  candidates: string[],
  MediaRecorderCtor: typeof MediaRecorder,
): string | undefined {
  if (typeof MediaRecorderCtor.isTypeSupported !== "function") return undefined;
  return candidates.find((type) => MediaRecorderCtor.isTypeSupported(type));
}
