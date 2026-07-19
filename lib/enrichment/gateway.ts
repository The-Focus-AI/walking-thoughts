import { generateText } from "ai";
import {
  getEnrichmentSystemInstruction,
  parseGatewayText,
} from "./system-instruction";
import type {
  EnrichmentSource,
  GatewayClient,
  GatewayGenerateInput,
  GatewayGeneration,
} from "./types";

export const DEFAULT_GATEWAY_MODEL = "anthropic/claude-sonnet-5";

type GatewayGlobals = typeof globalThis & {
  __WT_GATEWAY__?: GatewayClient;
};

export function getSelectedGatewayModel(
  environment: Record<string, string | undefined> = process.env,
): string {
  const configured = environment.AI_GATEWAY_MODEL?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_GATEWAY_MODEL;
}

export function createFakeGatewayClient(
  handler?: (
    input: GatewayGenerateInput,
  ) => Promise<{
    text: string;
    model?: string;
    title?: string | null;
    sources?: EnrichmentSource[];
  }>,
): GatewayClient {
  return {
    async generate(input) {
      if (handler) {
        const result = await handler(input);
        return {
          text: result.text,
          model: result.model ?? input.model,
          title: result.title ?? null,
          sources: result.sources ?? [],
        };
      }

      const sources: EnrichmentSource[] = [];
      if (input.search) {
        const hits = await input.search.search(
          input.prompt.slice(0, 120) || "walking thoughts",
        );
        sources.push(
          ...hits.map((hit) => ({
            title: hit.title,
            url: hit.url,
            retrievedAt: hit.retrievedAt,
          })),
        );
      }

      const mediaNote =
        input.media.length > 0
          ? ` with ${input.media.map((part) => part.kind).join(",")}`
          : "";
      const title = input.requestTitle ? "Trail notes" : null;
      const body = `Enrichment for model ${input.model}${mediaNote}`;
      return {
        text: input.requestTitle ? `TITLE: ${title}\n${body}` : body,
        model: input.model,
        title,
        sources,
      } satisfies GatewayGeneration;
    },
  };
}

function createAiSdkGatewayClient(): GatewayClient {
  return {
    async generate(input) {
      const sources: EnrichmentSource[] = [];
      if (input.search) {
        const hits = await input.search.search(
          input.prompt.slice(0, 160) || "walking thoughts research",
        );
        sources.push(
          ...hits.map((hit) => ({
            title: hit.title,
            url: hit.url,
            retrievedAt: hit.retrievedAt,
          })),
        );
      }

      const sourceBlock =
        sources.length > 0
          ? `\n\nWeb search results (cite when used):\n${sources
              .map((source, index) => `${index + 1}. ${source.title} — ${source.url}`)
              .join("\n")}`
          : "";

      const content: Array<
        | { type: "text"; text: string }
        | { type: "file"; data: Uint8Array; mediaType: string }
        | { type: "image"; image: Uint8Array }
      > = [{ type: "text", text: `${input.prompt}${sourceBlock}` }];

      for (const part of input.media) {
        if (part.kind === "image") {
          content.push({ type: "image", image: part.bytes });
        } else {
          content.push({
            type: "file",
            data: part.bytes,
            mediaType: part.mimeType,
          });
        }
      }

      const result = await generateText({
        model: input.model,
        system: input.system,
        messages: [{ role: "user", content }],
      });

      const parsed = parseGatewayText(result.text, input.requestTitle);
      return {
        text: parsed.text,
        model: input.model,
        title: parsed.title,
        sources,
      };
    },
  };
}

export function getGatewayClient(
  environment: Record<string, string | undefined> = process.env,
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

  return createFakeGatewayClient();
}

export function enrichmentSystemAndModel(
  environment: Record<string, string | undefined> = process.env,
): { system: string; model: string } {
  return {
    system: getEnrichmentSystemInstruction(environment),
    model: getSelectedGatewayModel(environment),
  };
}
