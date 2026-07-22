# Enrichment research runs as an in-process agentic tool loop, not MCP

A report-style Enrichment needs real research: the model choosing its own
search queries and reading pages in full, not one pre-flight snippet search
pasted into the prompt (the previous design). We give the gateway model two
AI SDK `tool()` definitions — `web_search` and `read_page` — implemented
against Firecrawl's REST API, run under a hard step budget, with every tool
call persisted on the Enrichment as its research trace. We considered
wiring Firecrawl's official MCP server in via the AI SDK's MCP client
instead, and rejected it for the enrichment job: MCP pays off when many
interactive clients share one integration, whereas this is a single
headless server job that needs deterministic step/cost limits, a
self-defined minimal tool surface, and no extra service on its critical
path (the MCP client API is also still experimental). The same
FIRECRAWL_API_KEY remains usable with Firecrawl's MCP server for
interactive contexts outside this pipeline.

## Consequences

- The research seam widens from `WebSearchClient.search` (snippets) to
  search + full-page reads; Tavily remains a search-only fallback and the
  fake client pattern keeps dev/test offline.
- Enrichment latency and token cost rise with the loop; the step budget is
  the control.
