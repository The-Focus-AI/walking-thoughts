import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import { createMemoryEnrichmentRepository } from "@/lib/enrichment/memory-repository";
import { createMemoryThreadRepository } from "@/lib/sync/memory-repository";
import { createMemoryBlobStore } from "@/lib/media/memory-blob-store";

test("a photo and audio Capture enrich through Mycel with transcripts, original photo, and model provenance", async () => {
  const userId = "walker-media";
  const ns = crypto.randomUUID();
  const threads = createMemoryThreadRepository(ns);
  const repository = createMemoryEnrichmentRepository(ns, threads);
  const blobs = createMemoryBlobStore(ns);
  await threads.upsertCaptures(userId, [{
    id: "capture", text: "At the gate", createdAt: "2026-09-09T12:00:00Z", location: null,
    threadId: null, sequence: 1, idempotencyKey: "capture",
    attachments: [
      { id: "photo", kind: "image", fileName: "larch.png", mimeType: "image/png" },
      { id: "audio", kind: "audio", fileName: "walk.webm", mimeType: "audio/webm" },
    ],
  }]);
  for (const [id, mimeType] of [["photo", "image/png"], ["audio", "audio/webm"]]) {
    await blobs.put({ userId, attachmentId: id, mimeType, bytes: new Uint8Array([9, 2, 17]), operationId: id });
  }
  const callers: string[] = [];
  let photo: unknown;
  let prompt = "";
  const server = createServer(async (req, res) => {
    callers.push(String(req.headers["x-mycel-end-user"]));
    res.setHeader("Content-Type", "application/json");
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    if (req.url === "/v1/models") {
      res.end(JSON.stringify({ data: [
        { id: "test/vision", capabilities: ["chat", "tool-calling", "image-input"] },
        { id: "test/stt", capabilities: ["transcription"] },
        { id: "test/embed", capabilities: ["embeddings"] },
      ] }));
    } else if (req.url === "/v1/audio/transcriptions") {
      res.end(JSON.stringify({ text: "Why is this tree golden?" }));
    } else if (req.url === "/v1/embeddings") {
      res.end(JSON.stringify({ data: [{ index: 0, embedding: [0.1, -0.3] }], usage: { prompt_tokens: 3, total_tokens: 3 } }));
    } else {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const content = body.messages.find((m: { role: string }) => m.role === "user").content;
      photo = content.find((part: { type: string }) => part.type === "image_url");
      prompt = content.find((part: { type: string }) => part.type === "text").text;
      res.end(JSON.stringify({ id: "completion", object: "chat.completion", created: 1, model: "test/vision",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "TITLE: Golden larch\nKIND: observation\n\nLarches turn gold in autumn." } }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as { port: number };
    const result = await processPendingEnrichments(userId, repository, {
      environment: { MYCEL_API_KEY: "fixture", MYCEL_BASE_URL: `http://127.0.0.1:${port}/v1`, AI_GATEWAY_MODEL: "test/vision", AI_TRANSCRIPTION_MODEL: "test/stt", AI_GATEWAY_EMBEDDING_MODEL: "test/embed" },
      threadRepository: threads, blobStore: blobs, pushSender: null,
    });
    expect(result.results[0]?.reason).toBeUndefined();
    expect(result.results[0]).toMatchObject({ status: "complete" });
    expect(new Set(callers)).toEqual(new Set([userId]));
    expect(photo).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,CQIR" } });
    expect(prompt).toContain("Why is this tree golden?");
    const stored = await repository.listThreadEnrichments(userId, result.results[0].threadId);
    expect(stored[0]).toMatchObject({ model: "test/vision", text: "Larches turn gold in autumn.", transcripts: [{ attachmentId: "audio", text: "Why is this tree golden?", model: "test/stt" }] });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
