import { generateText } from "ai";
import {
  getEnrichmentSystemInstruction,
  parseGatewayText,
} from "./system-instruction";
import type { GatewayClient, GatewayGenerateInput } from "./types";

export const DEFAULT_GATEWAY_MODEL = "anthropic/claude-sonnet-5";

type GatewayGlobals = typeof globalThis & {
  __WT_GATEWAY__?: GatewayClient;
};

export function getSelectedGatewayModel(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const configured = environment.AI_GATEWAY_MODEL?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_GATEWAY_MODEL;
}

export function createFakeGatewayClient(
  handler?: (
    input: GatewayGenerateInput,
  ) => Promise<{ text: string; model?: string; title?: string | null }>,
): GatewayClient {
  return {
    async generate(input) {
      if (handler) {
        const result = await handler(input);
        return {
          text: result.text,
          model: result.model ?? input.model,
          title: result.title ?? null,
        };
      }
      const title = input.requestTitle ? "Trail notes" : null;
      const body = `Enrichment for model ${input.model}`;
      return {
        text: input.requestTitle ? `TITLE: ${title}\n${body}` : body,
        model: input.model,
        title,
      };
    },
  };
}

function createAiSdkGatewayClient(): GatewayClient {
  return {
    async generate(input) {
      const result = await generateText({
        model: input.model,
        system: input.system,
        prompt: input.prompt,
      });
      const parsed = parseGatewayText(result.text, input.requestTitle);
      return {
        text: parsed.text,
        model: input.model,
        title: parsed.title,
      };
    },
  };
}

export function getGatewayClient(
  environment: NodeJS.ProcessEnv = process.env,
): GatewayClient {
  const injected = (globalThis as GatewayGlobals).__WT_GATEWAY__;
  if (injected) return injected;

  if (
    environment.AI_GATEWAY_API_KEY ||
    environment.VERCEL_OIDC_TOKEN ||
    environment.NODE_ENV === "production"
  ) {
    return createAiSdkGatewayClient();
  }

  // Local/test fallback when Gateway credentials are absent.
  return createFakeGatewayClient();
}

export function enrichmentSystemAndModel(
  environment: NodeJS.ProcessEnv = process.env,
): { system: string; model: string } {
  return {
    system: getEnrichmentSystemInstruction(environment),
    model: getSelectedGatewayModel(environment),
  };
}
