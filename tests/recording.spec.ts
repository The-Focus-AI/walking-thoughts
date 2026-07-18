import { expect, test } from "@playwright/test";
import {
  AUDIO_LIMIT_MS,
  VIDEO_LIMIT_MS,
  createRecorder,
} from "@/lib/local-capture/recording";

class FakeMediaRecorder {
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  static isTypeSupported(type: string) {
    return type.includes("webm");
  }

  constructor(
    private readonly stream: { getTracks(): Array<{ stop(): void }> },
    public readonly options?: { mimeType?: string },
  ) {}

  start() {
    this.state = "recording";
    this.ondataavailable?.({
      data: new Blob([new Uint8Array([1, 2, 3])], {
        type: this.options?.mimeType || "audio/webm",
      }),
    });
  }

  stop() {
    this.state = "inactive";
    for (const track of this.stream.getTracks()) track.stop();
    this.onstop?.();
  }
}

test("audio and video recorders enforce duration limits and return durable blobs", async () => {
  let now = 1_000;
  let tracksStopped = 0;
  const mediaDevices = {
    async getUserMedia() {
      return {
        getTracks() {
          return [
            {
              stop() {
                tracksStopped += 1;
              },
            },
          ];
        },
      };
    },
  };

  const recorder = createRecorder({
    mediaDevices: mediaDevices as unknown as MediaDevices,
    MediaRecorderCtor: FakeMediaRecorder as unknown as typeof MediaRecorder,
    now: () => now,
  });

  const audioPromise = recorder.record("audio", { maxMs: 25 });
  now = 1_030;
  await Promise.resolve();
  const audio = await audioPromise;
  expect(audio.kind).toBe("audio");
  expect(audio.hitLimit).toBe(true);
  expect(audio.bytes.size).toBeGreaterThan(0);
  expect(tracksStopped).toBeGreaterThan(0);

  const videoPromise = recorder.record("video", { maxMs: 15 });
  now = 1_050;
  const video = await videoPromise;
  expect(video.kind).toBe("video");
  expect(video.hitLimit).toBe(true);
  expect(VIDEO_LIMIT_MS).toBe(2 * 60 * 1000);
  expect(AUDIO_LIMIT_MS).toBe(10 * 60 * 1000);
});
