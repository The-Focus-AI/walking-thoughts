export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  retrievedAt: string;
};

export type WebSearchClient = {
  search(query: string): Promise<WebSearchResult[]>;
};

type SearchGlobals = typeof globalThis & {
  __WT_WEB_SEARCH__?: WebSearchClient;
};

export function createFakeWebSearchClient(
  handler?: (query: string) => Promise<WebSearchResult[]>,
): WebSearchClient {
  return {
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
  };
}

/** Optional Tavily-backed search when TAVILY_API_KEY is set. */
function createTavilySearchClient(apiKey: string): WebSearchClient {
  return {
    async search(query) {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: 5,
          include_answer: false,
        }),
      });
      if (!response.ok) {
        throw new Error(`web_search_http_${response.status}`);
      }
      const body = (await response.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      const retrievedAt = new Date().toISOString();
      return (body.results ?? [])
        .filter((row) => row.title && row.url)
        .map((row) => ({
          title: row.title as string,
          url: row.url as string,
          snippet: row.content ?? "",
          retrievedAt,
        }));
    },
  };
}

export function getWebSearchClient(
  environment: Record<string, string | undefined> = process.env,
): WebSearchClient {
  const injected = (globalThis as SearchGlobals).__WT_WEB_SEARCH__;
  if (injected) return injected;
  const tavily = environment.TAVILY_API_KEY?.trim();
  if (tavily) return createTavilySearchClient(tavily);
  return createFakeWebSearchClient();
}
