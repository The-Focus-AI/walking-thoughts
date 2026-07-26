import type { MediaKind } from "@/lib/local-capture/types";

export type ModelMediaCapabilities = {
  text: boolean;
  image: boolean;
  audio: boolean;
  video: boolean;
};

/**
 * Known gateway model capabilities. Unknown models are text-only.
 *
 * Checked against the gateway's own list (https://ai-gateway.vercel.sh/v1/models,
 * which publishes `modalities.input` per model) on 2026-07-26: of 204 language
 * models, 204 take text, 122 take image, 94 take pdf, and **none** take audio
 * or video. Two entries here claimed otherwise and were wrong, which is why
 * audio needs its own transcription pass (ADR 0015) rather than a model swap,
 * and why a video Capture has no model that can read it at all.
 *
 * Entries are models released in 2026 that a walker might actually set
 * AI_GATEWAY_MODEL to — every one reads images, so a photographed Capture
 * survives any choice here. An unlisted model is treated as text-only and
 * refuses photographs, so a model old enough to be dropped from this table
 * announces itself rather than quietly degrading.
 */
const REGISTRY: Record<string, ModelMediaCapabilities> = {
  // 2026-07-24
  "anthropic/claude-opus-5": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-07-24
  "anthropic/claude-opus-5-fast": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-07-01
  "anthropic/claude-fable-5": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-06-29
  "anthropic/claude-sonnet-5": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-05-28
  "anthropic/claude-opus-4.8": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-02-17
  "anthropic/claude-sonnet-4.6": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-07-09
  "openai/gpt-5.6-terra": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-07-09
  "openai/gpt-5.6-sol": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-07-09
  "openai/gpt-5.6-luna": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-04-24
  "openai/gpt-5.5": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-07-21
  "google/gemini-3.6-flash": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-05-19
  "google/gemini-3.5-flash": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-07-21
  "google/gemini-3.5-flash-lite": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  // 2026-07-08
  "xai/grok-4.5": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
};

/** Every model this table knows, for tests that guard its invariants. */
export const KNOWN_MODEL_IDS = Object.keys(REGISTRY);

export function getModelCapabilities(model: string): ModelMediaCapabilities {
  return (
    REGISTRY[model] ?? {
      text: true,
      image: false,
      audio: false,
      video: false,
    }
  );
}

export type CapabilityCheck =
  | { ok: true }
  | { ok: false; unsupported: MediaKind[]; reason: string };

export function assertModelSupportsMedia(
  model: string,
  kinds: MediaKind[],
): CapabilityCheck {
  const caps = getModelCapabilities(model);
  const unsupported = [...new Set(kinds)].filter((kind) => !caps[kind]);
  if (unsupported.length === 0) return { ok: true };
  return {
    ok: false,
    unsupported,
    reason: `model_${model}_unsupported_media_${unsupported.join("_")}`,
  };
}
