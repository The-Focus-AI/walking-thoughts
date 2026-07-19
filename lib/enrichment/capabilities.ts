import type { MediaKind } from "@/lib/local-capture/types";

export type ModelMediaCapabilities = {
  text: boolean;
  image: boolean;
  audio: boolean;
  video: boolean;
};

/** Known gateway model capabilities. Unknown models are text-only. */
const REGISTRY: Record<string, ModelMediaCapabilities> = {
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
    audio: true,
    video: false,
  },
  "google/gemini-2.5-flash": {
    text: true,
    image: true,
    audio: true,
    video: true,
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
