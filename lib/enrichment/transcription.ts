import { experimental_transcribe as transcribeAudio } from "ai";

/**
 * Transcription is its own gateway call because the Enrichment model is not
 * required to decode audio: the default `anthropic/claude-sonnet-5` reads text
 * and images only (see capabilities.ts). A held-button audio Capture would
 * otherwise land in needs_attention forever. Running speech-to-text first
 * turns the recording into words every model can read — and gives the walker
 * their own words back at the desk.
 */
export const DEFAULT_TRANSCRIPTION_MODEL = "openai/gpt-4o-mini-transcribe";

export type TranscriptionRequest = {
  attachmentId: string;
  mimeType: string;
  fileName: string;
  bytes: Uint8Array;
};

export type TranscriptionResult = {
  text: string;
  model: string;
  language?: string | null;
  durationSeconds?: number | null;
};

export type TranscriptionClient = {
  model: string;
  transcribe(input: TranscriptionRequest): Promise<TranscriptionResult>;
};

type TranscriptionGlobals = typeof globalThis & {
  __WT_TRANSCRIBER__?: TranscriptionClient;
};

export function getTranscriptionModel(
  environment: Record<string, string | undefined> = process.env,
): string {
  const configured = environment.AI_TRANSCRIPTION_MODEL?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_TRANSCRIPTION_MODEL;
}

export function createFakeTranscriptionClient(
  handler?: (input: TranscriptionRequest) => Promise<string> | string,
  model = "fake-transcription",
): TranscriptionClient {
  return {
    model,
    async transcribe(input) {
      const text = handler
        ? await handler(input)
        : `Transcript of ${input.fileName}`;
      return { text, model };
    },
  };
}

function createGatewayTranscriptionClient(model: string): TranscriptionClient {
  return {
    model,
    async transcribe(input) {
      const result = await transcribeAudio({
        model,
        audio: input.bytes,
      });
      return {
        text: result.text.trim(),
        model,
        language: result.language ?? null,
        durationSeconds: result.durationInSeconds ?? null,
      };
    },
  };
}

/**
 * The real client only appears where gateway credentials do — local and test
 * runs get the fake, the same seam the Enrichment gateway uses.
 */
export function getTranscriptionClient(
  environment: Record<string, string | undefined> = process.env,
): TranscriptionClient {
  const injected = (globalThis as TranscriptionGlobals).__WT_TRANSCRIBER__;
  if (injected) return injected;

  const model = getTranscriptionModel(environment);
  if (
    environment.AI_GATEWAY_API_KEY ||
    environment.VERCEL_OIDC_TOKEN ||
    environment.NODE_ENV === "production"
  ) {
    return createGatewayTranscriptionClient(model);
  }

  return createFakeTranscriptionClient(undefined, model);
}
