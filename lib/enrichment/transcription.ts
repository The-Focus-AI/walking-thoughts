import { z } from "zod";
import { createMycelClient, type MycelEnvironment } from "./mycel";

/**
 * Recorded audio is transcribed before Enrichment, preserving the walker's
 * words and the model that heard them. Mycel's multipart transcription endpoint keeps
 * the original filename and MIME type; realtime-only models are not suitable.
 * A live, priced transcription offer is required, just as for chat/embeddings.
 */
export const DEFAULT_TRANSCRIPTION_MODEL = "openai/whisper-large-v3";

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

function createGatewayTranscriptionClient(model: string, environment: MycelEnvironment, userId?: string): TranscriptionClient {
  const mycel = createMycelClient(environment, userId);
  return {
    model,
    async transcribe(input) {
      await mycel.requireModel(model, ["transcription"]);
      const body = new FormData();
      body.set("model", model);
      body.set("file", new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }), input.fileName);
      const response = await fetch(`${mycel.baseURL}/audio/transcriptions`, {
        method: "POST", body,
        headers: { ...mycel.headers, "X-Exchange-Require-Capability": "transcription" },
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`mycel_transcription_http_${response.status}`);
      const result = z.object({
        text: z.string(), language: z.string().nullish(), duration: z.number().nullish(),
        usage: z.object({ seconds: z.number().nullish() }).nullish(),
      }).parse(await response.json());
      if (!result.text.trim()) throw new Error("mycel_transcription_empty");
      return {
        text: result.text.trim(),
        model,
        language: result.language ?? null,
        durationSeconds: result.duration ?? result.usage?.seconds ?? null,
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
  userId?: string,
): TranscriptionClient {
  const injected = (globalThis as TranscriptionGlobals).__WT_TRANSCRIBER__;
  if (injected) return injected;

  const model = getTranscriptionModel(environment);
  if (
    environment.MYCEL_API_KEY ||
    environment.NODE_ENV === "production"
  ) {
    return createGatewayTranscriptionClient(model, environment, userId);
  }

  return createFakeTranscriptionClient(undefined, model);
}
