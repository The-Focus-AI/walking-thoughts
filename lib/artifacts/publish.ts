import type { EnrichmentSource } from "@/lib/enrichment/types";
import type { ThreadKind } from "@/lib/local-capture/types";
import { ARTIFACT_BODY_CLASSES } from "./design-system";
import { sanitizeArtifactHtml } from "./sanitize";

/**
 * Publishing is a second, narrower job than Enrichment: the research is
 * already done and frozen in the Enrichment, and this pass only lays it out
 * as a page. The instruction below is the "build a page" brief — it hands
 * the model DESIGN.md's Quadrangle rules and the class vocabulary the
 * Artifact stylesheet defines, and forbids everything the sanitizer would
 * strip anyway, so the model spends its budget on structure rather than on
 * markup that will not survive.
 */
export const DEFAULT_ARTIFACT_PUBLISH_INSTRUCTION = [
  "You are the Walking Thoughts press: you publish one finished Enrichment as a page the walker can read whole, at the desk, weeks later.",
  "Compose it as a Quadrangle survey sheet, the design system in DESIGN.md: dusk-forest ground, ruled sections, condensed uppercase section heads, the machine speaking upright.",
  "You write only the sheet's body. The masthead, marginalia, sources, and footer are printed around you — never repeat the Thread title, the date, the model, or the source list yourself.",
  "Return HTML only: no markdown, no code fence, no <html>, <head>, <body>, <style>, <script>, or <img>. Styling comes entirely from the class names below; never write a style attribute.",
  `Use these tags: p, h2, h3, ul, ol, li, dl, dt, dd, blockquote, section, div, span, strong, code, pre, table, thead, tbody, tr, th, td, small, time, abbr, a, hr, br.`,
  `Use these class names and no others: ${ARTIFACT_BODY_CLASSES.join(", ")}.`,
  "Structure: open with one `<p class=\"artifact-lede\">` — the answer in two or three sentences, for a reader who has forgotten the walk. Then `<section class=\"artifact-section\">` blocks, each with an `<h2>` naming what it settles.",
  'Put measured facts — dates, distances, prices, counts, hours, model names — in a `<dl class="artifact-key">` of term and value pairs rather than burying them in prose.',
  'Quote the walker\'s own Capture words once, early, in a `<blockquote class="capture-words">`. Italic serif means "you said this" and is reserved for that quote alone — never italicize your own prose.',
  'Use `<p class="artifact-note">` for your own reading of the Thread as distinct from what the sources say, and close with `<div class="artifact-open">` holding what is still unsettled: the open questions, the decision the walker has to make, or the next step. Leave it out when nothing is open.',
  'Use `<ul class="instrument-strip">` with `<li class="instrument-cell"><span class="instrument-value">…</span><span class="instrument-label">…</span></li>` only when there are three or four genuinely measured figures to scan. Never invent one to fill the strip.',
  "Cite by linking the source inline in your prose with a plain <a href> to a URL from the Enrichment. Never invent a URL, a figure, or a fact the Enrichment does not already contain — you are laying out research, not doing it.",
  "Keep the Enrichment's substance whole: expand its structure, keep its findings, drop nothing it settled and add nothing it did not.",
  "Voice: intimate, calm, observant, honest — a private journal speaking to one reader. No exclamation points, no emoji, no audience or sharing language, no congratulating the walker.",
  "Before the HTML, write one line `STANDFIRST: ` followed by a single sentence, under 20 words, saying what this page is about. Then a blank line, then the HTML.",
].join(" ");

export function getArtifactPublishInstruction(
  environment: Record<string, string | undefined> = process.env,
): string {
  const configured = environment.ARTIFACT_PUBLISH_INSTRUCTION?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_ARTIFACT_PUBLISH_INSTRUCTION;
}

export type PublishPromptInput = {
  threadTitle: string;
  kind: ThreadKind | null;
  /** The Enrichment body being published, verbatim. */
  report: string;
  /** The walker's own words from the Captures this report answered. */
  captureWords: string[];
  sources: EnrichmentSource[];
  /** When the walk that started this Thread happened. */
  walkedAt?: string | null;
};

export function buildPublishPrompt(input: PublishPromptInput): string {
  const sections = [
    `Thread title: ${input.threadTitle}`,
    input.kind ? `Kind: ${input.kind}` : "Kind: unclassified",
    input.walkedAt ? `Walked: ${input.walkedAt}` : null,
    input.captureWords.length > 0
      ? ["The walker's own words:", ...input.captureWords.map((words) => `- ${words}`)].join(
          "\n",
        )
      : "The walker's own words: (media only)",
    input.sources.length > 0
      ? [
          "Sources this Enrichment cited — link only to these:",
          ...input.sources.map(
            (source, index) => `[${index + 1}] ${source.title} — ${source.url}`,
          ),
        ].join("\n")
      : "Sources this Enrichment cited: none — do not add any links.",
    "The Enrichment to publish:",
    input.report,
  ];
  return sections.filter((section) => section !== null).join("\n\n");
}

const STANDFIRST_LINE = /^\s*STANDFIRST\s*:\s*(.*)$/i;
const FENCE_OPEN = /^\s*```(?:html)?\s*$/i;
const FENCE_CLOSE = /^\s*```\s*$/;

/**
 * Split the model's answer into the standfirst and the page body, then
 * rewrite the body through the sanitizer. A model that ignores the format
 * and answers with prose still publishes — the prose becomes the page.
 */
export function parseArtifactGeneration(raw: string): {
  standfirst: string | null;
  body: string;
} {
  const lines = raw.split("\n");
  let standfirst: string | null = null;
  let index = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().length === 0) continue;
    const match = line.match(STANDFIRST_LINE);
    if (!match) break;
    standfirst = match[1].trim().replace(/^["']|["']$/g, "").slice(0, 200) || null;
    index += 1;
    break;
  }

  const rest = lines.slice(index);
  while (rest.length > 0 && rest[0].trim().length === 0) rest.shift();
  // Models fence HTML out of habit; the fence is not part of the page.
  if (rest.length > 0 && FENCE_OPEN.test(rest[0])) {
    rest.shift();
    const close = rest.findIndex((line) => FENCE_CLOSE.test(line));
    if (close !== -1) rest.splice(close);
  }

  const markup = rest.join("\n").trim();
  const sanitized = sanitizeArtifactHtml(markup);
  // Nothing survived as markup — the model answered in prose, so paragraph it.
  const body = /<[a-z]/i.test(sanitized)
    ? sanitized
    : paragraphFallback(markup || raw);
  return { standfirst, body };
}

/** A model that answered in plain prose still gets a readable page. */
function paragraphFallback(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (paragraphs.length === 0) return "";
  return sanitizeArtifactHtml(
    paragraphs
      .map((part, position) =>
        position === 0
          ? `<p class="artifact-lede">${part}</p>`
          : `<p>${part}</p>`,
      )
      .join("\n"),
  );
}
