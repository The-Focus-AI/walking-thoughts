import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";
import { truncatePage, type ResearchStep } from "./research";
import {
  getEnrichmentSystemInstruction,
  parseGatewayText,
} from "./system-instruction";
import type {
  ThreadKind,
  EnrichmentSource,
  GatewayClient,
  GatewayGenerateInput,
  GatewayGeneration,
} from "./types";

export const DEFAULT_GATEWAY_MODEL = "anthropic/claude-sonnet-5";

/** Hard budget for the research loop (ADR 0012): tool steps + final text. */
export const RESEARCH_STEP_LIMIT = 8;

type GatewayGlobals = typeof globalThis & {
  __WT_GATEWAY__?: GatewayClient;
};

/**
 * `result.text` is only the *last* step's text. When the model writes the
 * report and then calls a tool — memory_patch, typically — the report lives
 * in an earlier step and the last step holds a closing line. Production lost
 * five Enrichment bodies that way, each reduced to a sentence referring to
 * "the report above". Keep the text of every step.
 */
export function collectGeneratedText(
  steps: ReadonlyArray<{ text?: string }>,
  lastStepText: string,
): string {
  const parts = steps
    .map((step) => step.text?.trim() ?? "")
    .filter((text) => text.length > 0);
  return parts.length > 0 ? parts.join("\n\n") : lastStepText.trim();
}

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
    kind?: ThreadKind | null;
    topics?: string[];
    ask?: string | null;
    project?: string | null;
    propose?: string | null;
    sources?: EnrichmentSource[];
    research?: ResearchStep[];
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
          kind: result.kind ?? null,
          topics: result.topics ?? [],
          ask: result.ask ?? null,
          project: result.project ?? null,
          propose: result.propose ?? null,
          sources: result.sources ?? [],
          research: result.research ?? [],
        };
      }

      const sources: EnrichmentSource[] = [];
      const research: ResearchStep[] = [];
      if (input.search) {
        const query = input.prompt.slice(0, 120) || "walking thoughts";
        const hits = await input.search.search(query);
        research.push({
          action: "search",
          provider: input.search.provider,
          query,
          resultCount: hits.length,
          at: new Date().toISOString(),
        });
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
        kind: "question",
        topics: [],
        ask: null,
        project: null,
        propose: null,
        sources,
        research,
      } satisfies GatewayGeneration;
    },
  };
}

/**
 * Real gateway: the model researches agentically — web_search finds
 * candidate pages, read_page fetches one in full — under a step budget.
 * Every tool call becomes a ResearchStep; read pages become Sources.
 */
function createAiSdkGatewayClient(): GatewayClient {
  return {
    async generate(input) {
      const research: ResearchStep[] = [];
      const readSources = new Map<string, EnrichmentSource>();
      const searchHits = new Map<string, EnrichmentSource>();
      const client = input.search;

      const tools: ToolSet = {};
      const memory = input.memory;
      if (memory) {
        tools.memory_patch = tool({
          description:
            "Revise the walker profile: add a new durable fact about the walker, or update/remove an existing one by the [id] shown in the profile. Use sparingly — only facts useful months from now.",
          inputSchema: z.object({
            op: z.enum(["add", "update", "remove"]),
            memoryId: z
              .string()
              .optional()
              .describe("Required for update/remove — the [id] from the walker profile"),
            category: z
              .enum(["identity", "place", "interest", "expertise", "preference"])
              .optional()
              .describe("Required for add"),
            content: z
              .string()
              .optional()
              .describe("The fact, as a self-contained third-person statement. Required for add/update"),
          }),
          execute: async (patchInput: {
            op: "add" | "update" | "remove";
            memoryId?: string;
            category?: string;
            content?: string;
          }) => memory.apply(patchInput),
        });
      }

      if (client) {
        tools.web_search = tool({
          description:
            "Search the web for candidate pages. Returns titles, URLs, and snippets.",
          inputSchema: z.object({
            query: z.string().describe("The search query"),
          }),
          execute: async ({ query }: { query: string }) => {
            const hits = await client.search(query);
            research.push({
              action: "search",
              provider: client.provider,
              query,
              resultCount: hits.length,
              at: new Date().toISOString(),
            });
            for (const hit of hits) {
              if (!searchHits.has(hit.url)) {
                searchHits.set(hit.url, {
                  title: hit.title,
                  url: hit.url,
                  retrievedAt: hit.retrievedAt,
                });
              }
            }
            return hits.map((hit) => ({
              title: hit.title,
              url: hit.url,
              snippet: hit.snippet,
            }));
          },
        });
        if (client.readPage) {
          tools.read_page = tool({
            description:
              "Fetch one web page in full as markdown. Use after web_search to read the most promising result before citing it.",
            inputSchema: z.object({
              url: z.string().describe("URL of the page to read"),
            }),
            execute: async ({ url }: { url: string }) => {
              const page = await client.readPage!(url);
              if (!page) {
                return { url, error: "page_unavailable" };
              }
              research.push({
                action: "read",
                provider: client.provider,
                url: page.url,
                title: page.title,
                at: page.retrievedAt,
              });
              readSources.set(page.url, {
                title: page.title,
                url: page.url,
                retrievedAt: page.retrievedAt,
              });
              return {
                url: page.url,
                title: page.title,
                markdown: truncatePage(page.markdown),
              };
            },
          });
        }
      }

      const hasTools = Object.keys(tools).length > 0;

      const content: Array<
        | { type: "text"; text: string }
        | { type: "file"; data: Uint8Array; mediaType: string }
        | { type: "image"; image: Uint8Array }
      > = [{ type: "text", text: input.prompt }];

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
        // The SDK's Anthropic default is 4,096 — enough for a report, not
        // for one laid out as a page, where markup spends tokens the reader
        // never sees. A truncated Artifact came back thinner than the
        // Enrichment it published.
        ...(input.maxOutputTokens
          ? { maxOutputTokens: input.maxOutputTokens }
          : {}),
        ...(hasTools
          ? { tools, stopWhen: stepCountIs(RESEARCH_STEP_LIMIT) }
          : {}),
      });

      // Pages the model actually read are the citable Sources; fall back to
      // search hits (capped) when it answered from snippets alone.
      const sources =
        readSources.size > 0
          ? [...readSources.values()]
          : [...searchHits.values()].slice(0, 5);

      const parsed = parseGatewayText(
        collectGeneratedText(result.steps, result.text),
        input.requestTitle,
      );
      return {
        text: parsed.text,
        model: input.model,
        title: parsed.title,
        kind: parsed.kind,
        topics: parsed.topics,
        ask: parsed.ask,
        project: parsed.project,
        propose: parsed.propose,
        sources,
        research,
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
