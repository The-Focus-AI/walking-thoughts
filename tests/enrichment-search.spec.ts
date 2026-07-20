import { expect, test } from "@playwright/test";
import { getWebSearchClient } from "@/lib/enrichment/search";

test("real-model environments without TAVILY_API_KEY skip search entirely", () => {
  expect(getWebSearchClient({ NODE_ENV: "production" })).toBeNull();
  expect(getWebSearchClient({ AI_GATEWAY_API_KEY: "gateway" })).toBeNull();
  expect(getWebSearchClient({ VERCEL_OIDC_TOKEN: "token" })).toBeNull();
  expect(getWebSearchClient({ NODE_ENV: "production", TAVILY_API_KEY: " " })).toBeNull();
});

test("local development without TAVILY_API_KEY falls back to the fake client", async () => {
  const client = getWebSearchClient({ NODE_ENV: "development" });
  expect(client).not.toBeNull();
  const hits = await client!.search("barred owl");
  expect(hits[0].url).toContain("example.test");
});

test("TAVILY_API_KEY selects the real search client in any environment", () => {
  const client = getWebSearchClient({
    NODE_ENV: "production",
    TAVILY_API_KEY: "tvly-key",
  });
  expect(client).not.toBeNull();
});
