import { expect, test } from "@playwright/test";

// Low-volume smoke tests against isolated preview resources. Each test skips
// when its credential is absent, so the suite stays green locally and in CI
// without secrets while still exercising the real integrations on machines
// configured with the preview vault (fnox profile "preview").
//
// Clerk's smoke coverage lives in tests/auth.spec.ts behind the same pattern.

const smokeRunId = `smoke-${Date.now()}`;

test.describe("preview integration smoke", () => {
  test("Neon database answers a round-trip", async () => {
    test.skip(!process.env.DATABASE_URL, "DATABASE_URL is not configured");
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT 1 AS ready`;
    expect(rows[0]?.ready).toBe(1);
  });

  test("private Vercel Blob stores, serves, and deletes one small object", async () => {
    test.skip(
      !process.env.BLOB_READ_WRITE_TOKEN,
      "BLOB_READ_WRITE_TOKEN is not configured",
    );
    const { createVercelBlobStore } = await import(
      "@/lib/media/vercel-blob-store"
    );
    const store = createVercelBlobStore(process.env.BLOB_READ_WRITE_TOKEN!);
    const bytes = new TextEncoder().encode("walking thoughts smoke");

    const put = await store.put({
      userId: smokeRunId,
      attachmentId: "smoke-attachment",
      mimeType: "text/plain",
      bytes,
      operationId: `${smokeRunId}-op`,
    });
    expect(put.attachmentId).toBe("smoke-attachment");

    const object = await store.get(smokeRunId, "smoke-attachment");
    expect(object).not.toBeNull();
    expect(new TextDecoder().decode(object!.bytes)).toBe(
      "walking thoughts smoke",
    );

    // Cross-user path scoping: another user id resolves nothing.
    expect(await store.get("someone-else", "smoke-attachment")).toBeNull();

    const removed = await store.delete!(smokeRunId, "smoke-attachment");
    expect(removed.deleted).toBe(true);
  });

  test("Vercel AI Gateway generates one tiny completion on the selected model", async () => {
    test.skip(
      !process.env.AI_GATEWAY_API_KEY,
      "AI_GATEWAY_API_KEY is not configured",
    );
    const { generateText } = await import("ai");
    const { getSelectedGatewayModel } = await import(
      "@/lib/enrichment/gateway"
    );
    const result = await generateText({
      model: getSelectedGatewayModel(),
      prompt: "Reply with the single word: ready",
    });
    expect(result.text.toLowerCase()).toContain("ready");
  });

  test("web search returns sourced results", async () => {
    test.skip(!process.env.TAVILY_API_KEY, "TAVILY_API_KEY is not configured");
    const { getWebSearchClient } = await import("@/lib/enrichment/search");
    const results = await getWebSearchClient().search(
      "Appalachian Trail Connecticut",
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).toMatch(/^https:\/\//);
  });

  test("web push credentials produce a deliverable request", async () => {
    test.skip(
      !(
        (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
          process.env.VAPID_PUBLIC_KEY) &&
        process.env.VAPID_PRIVATE_KEY
      ),
      "VAPID keys are not configured",
    );
    // A real endpoint requires a browser subscription; the smoke check
    // verifies the sender accepts the configured VAPID key pair and reports
    // a subscription-level outcome ("gone"/"failed") on a synthetic
    // endpoint rather than rejecting the credentials outright.
    const { createWebPushSender } = await import("@/lib/push/send");
    const sender = createWebPushSender();
    expect(sender).not.toBeNull();
    const outcome = await sender!.send(
      {
        endpoint: "https://updates.push.services.mozilla.com/wpush/v2/smoke",
        p256dh:
          "BIPUL12DLfytvTajnryr2PRdAgXS3HGKiLqndGcJGabyhHheJYlNGCeXl1dn18gSJ1WAkAPIxr4gK0_dQds4yiI",
        auth: "FPssNDTKnInHVndSTdbKFw",
        createdAt: new Date().toISOString(),
      },
      { title: "smoke", body: "smoke", url: "/", tag: smokeRunId },
    );
    expect(["sent", "gone", "failed"]).toContain(outcome);
  });
});
