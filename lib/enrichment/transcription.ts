import { experimental_transcribe as transcribeAudio } from "ai";

/**
 * Transcription is its own gateway call because no Enrichment model can decode
 * audio. Not "the one we run" — checked against the gateway's own model list on
 * 2026-07-26, all 204 language models accept text, image, and pdf, and nothing
 * else (see capabilities.ts). A held-button audio Capture has exactly one route
 * to a report: speech-to-text first. It also gives the walker their own words
 * back at the desk, which sending bytes to a model never would.
 *
 * Newest is not the same as callable. The gateway lists five transcription
 * models, and `openai/gpt-realtime-whisper` — the newest, and briefly the
 * default here — is tagged `websocket-realtime`: it streams transcript deltas
 * from live audio over a socket, and a held recording posted to the batch
 * endpoint gets nothing back. Enrichment runs long after the walk, on a file,
 * so the model has to do batch. `xai/grok-stt` says so outright ("batch and
 * streaming modes"), was released 2026-03-16, and costs a tenth of the realtime
 * model per second. The model that heard a Capture is recorded on its
 * transcript, so a later change leaves the record of what produced each one.
 */
export const DEFAULT_TRANSCRIPTION_MODEL = "xai/grok-stt";

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
