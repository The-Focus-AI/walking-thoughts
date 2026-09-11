import { createServer, type IncomingHttpHeaders } from "node:http";
import { expect, test } from "@playwright/test";
import { getGatewayClient, getSelectedGatewayModel } from "@/lib/enrichment/gateway";
import { getEmbeddingClient } from "@/lib/enrichment/embeddings";
import { getTranscriptionClient } from "@/lib/enrichment/transcription";
import { probeIntegrationDependencies } from "@/lib/integrations/probes";
import { reportIntegrationHealth } from "@/lib/integrations/health";

test("unselected specialist models stay blocked without proprietary defaults", async () => {
  const environment = { MYCEL_API_KEY: "fixture", MYCEL_BASE_URL: "http://127.0.0.1:1/v1" };
  await expect(getEmbeddingClient(environment, "walker").embed("A pine tree")).rejects.toThrow("AI_GATEWAY_EMBEDDING_MODEL_required");
  await expect(getTranscriptionClient(environment, "walker").transcribe({
    attachmentId: "recording", fileName: "walk.wav", mimeType: "audio/wav", bytes: new Uint8Array([1]),
  })).rejects.toThrow("AI_TRANSCRIPTION_MODEL_required");
});

test("health fails closed when a configured Mycel model lacks its required operation", async () => {
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [
      { id: "test/vision", capabilities: ["chat", "tool-calling", "image-input"] },
      { id: "test/stt", capabilities: ["transcription"] },
      { id: "test/embed", capabilities: ["chat"] },
    ] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as { port: number };
    const environment = { MYCEL_API_KEY: "fixture", MYCEL_BASE_URL: `http://127.0.0.1:${port}/v1`, AI_GATEWAY_MODEL: "test/vision", AI_TRANSCRIPTION_MODEL: "test/stt", AI_GATEWAY_EMBEDDING_MODEL: "test/embed" };
    const probes = await probeIntegrationDependencies({ ...environment, NODE_ENV: "test" });
    const health = reportIntegrationHealth(environment, probes);
    expect(health.services.gateway).toEqual({ status: "error", detail: "mycel_models_unavailable" });
    const glmOnly = { ...environment, AI_TRANSCRIPTION_MODEL: "", AI_GATEWAY_EMBEDDING_MODEL: "" };
    const enabledProbes = await probeIntegrationDependencies({ ...glmOnly, NODE_ENV: "test" });
    expect(reportIntegrationHealth(glmOnly, enabledProbes).services.gateway).toEqual({ status: "ready" });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("blank successful transcription responses are rejected", async () => {
  const server = createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.url === "/v1/models" ? { data: [{ id: "test/stt", capabilities: ["transcription"] }] } : { text: "  " }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as { port: number };
    const client = getTranscriptionClient({ MYCEL_API_KEY: "fixture", MYCEL_BASE_URL: `http://127.0.0.1:${port}/v1`, AI_TRANSCRIPTION_MODEL: "test/stt" }, "walker");
    await expect(client.transcribe({ attachmentId: "audio", fileName: "walk.webm", mimeType: "audio/webm", bytes: new Uint8Array([1]) })).rejects.toThrow("mycel_transcription_empty");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("recorded audio is sent as a named multipart file and outages never become fake transcripts", async () => {
  let unavailable = false;
  let defaultJson = false;
  let uploaded: FormData | undefined;
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/models") {
      res.end(JSON.stringify({ data: [{ id: "test/stt", capabilities: ["transcription"] }] }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    uploaded = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": String(req.headers["content-type"]) } }).formData();
    expect(req.url).toBe("/v1/audio/transcriptions");
    expect(req.headers["x-mycel-end-user"]).toBe("walker-audio");
    res.statusCode = unavailable ? 503 : 200;
    res.end(JSON.stringify(unavailable ? { error: "no_supplier" } : defaultJson ? { text: "The larch is golden.", usage: { seconds: 3.25 } } : { text: "  The larch is golden.  ", language: "en", duration: 2.75 }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as { port: number };
    const client = getTranscriptionClient({ MYCEL_API_KEY: "fixture", MYCEL_BASE_URL: `http://127.0.0.1:${port}/v1`, AI_TRANSCRIPTION_MODEL: "test/stt" }, "walker-audio");
    const input = { attachmentId: "recording", fileName: "walk.webm", mimeType: "audio/webm", bytes: new Uint8Array([9, 2, 17]) };
    expect(await client.transcribe(input)).toEqual({ text: "The larch is golden.", model: "test/stt", language: "en", durationSeconds: 2.75 });
    expect(uploaded?.get("model")).toBe("test/stt");
    const file = uploaded?.get("file") as File;
    expect(file.name).toBe("walk.webm");
    expect(file.type).toBe("audio/webm");
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([9, 2, 17]);
    defaultJson = true;
    expect(await client.transcribe(input)).toEqual({ text: "The larch is golden.", model: "test/stt", language: null, durationSeconds: 3.25 });
    unavailable = true;
    await expect(client.transcribe(input)).rejects.toThrow("mycel_transcription_http_503");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("embeddings use Mycel, preserve asymmetric vectors, and isolate caller attribution", async () => {
  const callers: string[] = [];
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/models") {
      res.end(JSON.stringify({ data: [{ id: "test/embed", capabilities: ["embeddings"] }] }));
      return;
    }
    callers.push(String(req.headers["x-mycel-end-user"]));
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    expect(req.url).toBe("/v1/embeddings");
    expect(body.input).toEqual(["A larch by the gate"]);
    res.end(JSON.stringify({ data: [{ index: 0, embedding: [0.25, -0.75, 0.5] }], model: "test/embed", usage: { prompt_tokens: 6, total_tokens: 6 } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as { port: number };
    const environment = { MYCEL_API_KEY: "fixture", MYCEL_BASE_URL: `http://127.0.0.1:${port}/v1`, AI_GATEWAY_EMBEDDING_MODEL: "test/embed" };
    for (const user of ["walker-a", "walker-b"]) {
      const client = getEmbeddingClient(environment, user);
      expect(await client.embed("A larch by the gate")).toEqual([0.25, -0.75, 0.5]);
      expect(client.model).toBe("test/embed");
    }
    expect(callers).toEqual(["walker-a", "walker-b"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("photo input is rejected before inference unless the live catalog advertises vision", async () => {
  let generations = 0;
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/models") {
      res.end(JSON.stringify({ data: [{ id: "test/text", capabilities: ["chat"] }] }));
    } else {
      generations++;
      res.end("{}");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as { port: number };
    const gateway = getGatewayClient({ MYCEL_API_KEY: "fixture", MYCEL_BASE_URL: `http://127.0.0.1:${port}/v1` }, "walker-photo");
    await expect(gateway.generate({
      model: "test/text", system: "Identify", prompt: "What is this?", requestTitle: false,
      media: [{ attachmentId: "photo", kind: "image", mimeType: "image/png", fileName: "photo.png", bytes: new Uint8Array([1, 2, 3]) }],
    })).rejects.toThrow("mycel_capability_unavailable_test/text_image-input");
    expect(generations).toBe(0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("missing production credentials and missing caller identity never produce fake Enrichments", () => {
  expect(() => getGatewayClient({ NODE_ENV: "production" }, "walker")).toThrow("MYCEL_API_KEY_required");
  expect(() => getGatewayClient({ MYCEL_API_KEY: "fixture" })).toThrow("mycel_end_user_required");
});

test("Mycel generation preserves per-user attribution and executes a research tool round trip", async () => {
  const requests: Array<{ path: string; headers: IncomingHttpHeaders; body: Record<string, unknown> }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    requests.push({ path: req.url!, headers: req.headers, body });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/models") {
      res.end(JSON.stringify({ data: [{ id: "z-ai/glm-5.3-flash", capabilities: ["chat", "tool-calling"] }] }));
      return;
    }
    const hasResult = body.messages.some((m: { role: string }) => m.role === "tool");
    res.end(JSON.stringify({
      id: "completion-1", object: "chat.completion", created: 1, model: "z-ai/glm-5.3-flash",
      choices: [{ index: 0, finish_reason: hasResult ? "stop" : "tool_calls", message: hasResult
        ? { role: "assistant", content: "A larch is a deciduous conifer." }
        : { role: "assistant", content: null, tool_calls: [{ id: "call-search", type: "function", function: { name: "web_search", arguments: JSON.stringify({ query: "larch needles" }) } }] } }],
      usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 },
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const environment = { MYCEL_API_KEY: "test-credential", MYCEL_BASE_URL: `http://127.0.0.1:${address.port}/v1` };
    const searches: string[] = [];
    const gateway = getGatewayClient(environment, "walker-17");
    const result = await gateway.generate({
      model: getSelectedGatewayModel(environment), system: "Research the Capture.", prompt: "What is a larch?", requestTitle: false, media: [],
      search: { provider: "test", async search(query) { searches.push(query); return []; }, async readPage() { return null; } },
    });
    expect(result.text).toBe("A larch is a deciduous conifer.");
    expect(result.model).toBe("z-ai/glm-5.3-flash");
    expect(searches).toEqual(["larch needles"]);
    const calls = requests.filter((r) => r.path === "/v1/chat/completions");
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.body.model).toBe("z-ai/glm-5.3-flash");
      expect(call.headers.authorization).toBe("Bearer test-credential");
      expect(call.headers["x-mycel-end-user"]).toBe("walker-17");
      expect(String(call.headers["x-exchange-require-capability"]).split(",")).toContain("tool-calling");
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
