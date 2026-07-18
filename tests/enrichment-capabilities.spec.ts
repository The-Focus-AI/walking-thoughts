import { expect, test } from "@playwright/test";
import { assertModelSupportsMedia } from "@/lib/enrichment/capabilities";

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
