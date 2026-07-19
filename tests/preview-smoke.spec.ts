import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { del, get, put } from "@vercel/blob";
import { generateText, createGateway } from "ai";
import { createTavilySearchClient } from "@/lib/enrichment/search";
import { createWebPushSender } from "@/lib/push/send";

/**
 * Low-volume smoke against isolated preview resources. Skips unless every
 * required preview secret is present — never invents fixtures that log secrets.
 */
const smokeEnabled = Boolean(
  process.env.PREVIEW_SMOKE === "1" &&
    process.env.DATABASE_URL &&
    process.env.BLOB_READ_WRITE_TOKEN &&
    process.env.AI_GATEWAY_API_KEY &&
    process.env.TAVILY_API_KEY &&
    (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY) &&
    process.env.VAPID_PRIVATE_KEY,
);

test.describe("preview integration smoke", () => {
  test.skip(!smokeEnabled, "Set PREVIEW_SMOKE=1 with preview vault secrets");

  test("Neon accepts a trivial round-trip", async () => {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = (await sql`select 1::int as ok`) as Array<{ ok: number }>;
    expect(rows[0]?.ok).toBe(1);
  });

  test("private Vercel Blob put/get/delete stays authenticated", async () => {
    const token = process.env.BLOB_READ_WRITE_TOKEN!;
    const pathname = `smoke/${Date.now()}-${Math.random().toString(16).slice(2)}.txt`;
    const body = `walking-thoughts-smoke-${Date.now()}`;
    await put(pathname, body, {
      access: "private",
      token,
      contentType: "text/plain",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    const loaded = await get(pathname, { access: "private", token });
    expect(loaded?.statusCode).toBe(200);
    const text = await new Response(loaded!.stream).text();
    expect(text).toBe(body);
    await del(pathname, { token });
  });

  test("Vercel AI Gateway accepts a minimal generation", async () => {
    const gateway = createGateway({
      apiKey: process.env.AI_GATEWAY_API_KEY!,
    });
    const model =
      process.env.AI_GATEWAY_MODEL?.trim() || "anthropic/claude-sonnet-5";
    const result = await generateText({
      model: gateway(model),
      prompt: "Reply with exactly: ok",
      maxOutputTokens: 16,
    });
    expect(result.text.toLowerCase()).toContain("ok");
  });

  test("web search client returns at least one result", async () => {
    const client = createTavilySearchClient(process.env.TAVILY_API_KEY!);
    const results = await client.search("OpenStreetMap trail map");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.url).toMatch(/^https?:\/\//);
  });

  test("push sender is configured from VAPID secrets", async () => {
    const sender = createWebPushSender();
    expect(sender).not.toBeNull();
  });
});
