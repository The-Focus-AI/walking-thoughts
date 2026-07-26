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
 * models, 204 take text, 122 take image, 94 take pdf — and **none** take audio
 * or video. This table said otherwise for gpt-5 and gemini-2.5-flash, which is
 * why audio needs its own transcription pass (ADR 0015) rather than a model
 * swap, and why a video Capture currently has no model that can read it at all.
 *
 * Keep entries to models a walker might actually set AI_GATEWAY_MODEL to: an
 * unlisted model is treated as text-only, so an image Capture under it fails
 * rather than being sent to a model that could have read it.
 */
const REGISTRY: Record<string, ModelMediaCapabilities> = {
  "anthropic/claude-opus-5": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  "anthropic/claude-sonnet-5": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  "anthropic/claude-sonnet-4.6": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  "anthropic/claude-sonnet-4.5": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  "openai/gpt-5": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  "openai/gpt-5.6-terra": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  "google/gemini-2.5-flash": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
  "google/gemini-3.6-flash": {
    text: true,
    image: true,
    audio: false,
    video: false,
  },
};

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
