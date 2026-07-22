import {
  getWebSearchClient,
  type WebSearchClient,
  type WebSearchResult,
} from "./search";

/** One tool call the model made while researching, persisted on the Enrichment. */
export type ResearchStep =
  | {
      action: "search";
      provider: string;
      query: string;
      resultCount: number;
      at: string;
    }
  | {
      action: "read";
      provider: string;
      url: string;
      title: string;
      at: string;
    };

export type ResearchPage = {
  url: string;
  title: string;
  markdown: string;
  retrievedAt: string;
};

/**
 * Research seam for report-style Enrichments (ADR 0012): search finds
 * candidate pages; readPage fetches one in full so the model can cite what
 * it actually read. readPage is optional — Tavily-backed clients search only.
 */
export type ResearchClient = {
  provider: string;
  search(query: string): Promise<WebSearchResult[]>;
  readPage?(url: string): Promise<ResearchPage | null>;
};

type ResearchGlobals = typeof globalThis & {
  __WT_RESEARCH__?: ResearchClient;
};

/** Keep read_page inputs bounded so one page cannot flood the context. */
export const READ_PAGE_MAX_CHARS = 16_000;

export function truncatePage(markdown: string): string {
  if (markdown.length <= READ_PAGE_MAX_CHARS) return markdown;
  return `${markdown.slice(0, READ_PAGE_MAX_CHARS)}\n\n[truncated]`;
}

export function createFirecrawlResearchClient(
  apiKey: string,
  baseUrl = "https://api.firecrawl.dev",
): ResearchClient {
  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`firecrawl_http_${response.status}`);
    }
    return (await response.json()) as T;
  }

  return {
    provider: "firecrawl",
    async search(query) {
      const body = await post<{
        data?: Array<{ title?: string; url?: string; description?: string }>;
      }>("/v1/search", { query, limit: 5 });
      const retrievedAt = new Date().toISOString();
      return (body.data ?? [])
        .filter((row) => row.title && row.url)
        .map((row) => ({
          title: row.title as string,
          url: row.url as string,
          snippet: row.description ?? "",
          retrievedAt,
        }));
    },
    async readPage(url) {
      const body = await post<{
        data?: {
          markdown?: string;
          metadata?: { title?: string; sourceURL?: string };
        };
      }>("/v1/scrape", { url, formats: ["markdown"], onlyMainContent: true });
      const markdown = body.data?.markdown;
      if (!markdown) return null;
      return {
        url: body.data?.metadata?.sourceURL ?? url,
        title: body.data?.metadata?.title ?? url,
        markdown: truncatePage(markdown),
        retrievedAt: new Date().toISOString(),
      };
    },
  };
}

/** Adapt a search-only client (Tavily, fakes, test doubles) to the seam. */
export function researchClientFromWebSearch(
  client: WebSearchClient,
  provider = "search",
): ResearchClient {
  const existing = client as Partial<ResearchClient> & WebSearchClient;
  if (typeof existing.provider === "string") {
    return existing as ResearchClient;
  }
  return {
    provider,
    search: (query) => client.search(query),
  };
}

export function createFakeResearchClient(
  handler?: (query: string) => Promise<WebSearchResult[]>,
): ResearchClient {
  return {
    provider: "fake",
    async search(query) {
      if (handler) return handler(query);
      const retrievedAt = new Date().toISOString();
      return [
        {
          title: `Result for ${query}`,
          url: `https://example.test/search?q=${encodeURIComponent(query)}`,
          snippet: `Synthetic search hit for ${query}`,
          retrievedAt,
        },
      ];
    },
    async readPage(url) {
      return {
        url,
        title: `Synthetic page ${url}`,
        markdown: `# Synthetic page\n\nFixture content for ${url}.`,
        retrievedAt: new Date().toISOString(),
      };
    },
  };
}

/**
 * Firecrawl (search + read) when configured; otherwise the existing web
 * search fallbacks (Tavily, or fake off-gateway) as search-only research.
 */
export function getResearchClient(
  environment: Record<string, string | undefined> = process.env,
): ResearchClient | null {
  const injected = (globalThis as ResearchGlobals).__WT_RESEARCH__;
  if (injected) return injected;
  const firecrawl = environment.FIRECRAWL_API_KEY?.trim();
  if (firecrawl) return createFirecrawlResearchClient(firecrawl);
  const search = getWebSearchClient(environment);
  if (!search) return null;
  const tavily = environment.TAVILY_API_KEY?.trim();
  return researchClientFromWebSearch(search, tavily ? "tavily" : "fake");
}
