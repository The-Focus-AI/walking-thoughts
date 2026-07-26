import { expect, test } from "@playwright/test";
import {
  assertModelSupportsMedia,
  getModelCapabilities,
  KNOWN_MODEL_IDS,
} from "@/lib/enrichment/capabilities";

test("capability registry accepts supported image models and rejects unsupported audio", async () => {
  expect(
    assertModelSupportsMedia("anthropic/claude-sonnet-5", ["image"]),
  ).toEqual({ ok: true });

  const rejected = assertModelSupportsMedia("anthropic/claude-sonnet-5", [
    "audio",
  ]);
  expect(rejected.ok).toBe(false);
  if (!rejected.ok) {
    expect(rejected.unsupported).toEqual(["audio"]);
    expect(rejected.reason).toContain("unsupported_media_audio");
  }
});

test("unknown models stay text-only and never silently gain media support", async () => {
  const check = assertModelSupportsMedia("vendor/mystery-model", ["image"]);
  expect(check.ok).toBe(false);
});

test("no known model claims to read audio or video, the way two once wrongly did", async () => {
  expect(KNOWN_MODEL_IDS.length).toBeGreaterThan(0);
  for (const model of KNOWN_MODEL_IDS) {
    const caps = getModelCapabilities(model);
    // The gateway has no language model that decodes either (ADR 0015). A new
    // entry claiming otherwise would silently route a Capture to a model that
    // rejects it, which is the bug this table already shipped once.
    expect({ model, audio: caps.audio, video: caps.video }).toEqual({
      model,
      audio: false,
      video: false,
    });
    expect(caps.image).toBe(true);
  }
});
