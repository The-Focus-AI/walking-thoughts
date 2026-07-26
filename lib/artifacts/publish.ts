import type { EnrichmentSource, ResearchStep } from "@/lib/enrichment/types";
import type { ThreadKind } from "@/lib/local-capture/types";
import { ARTIFACT_BODY_CLASSES } from "./design-system";
import { sanitizeArtifactHtml } from "./sanitize";

/**
 * The "build a page" brief.
 *
 * The first version of this instruction was almost entirely markup rules,
 * with one buried line asking the model to keep the report's substance. It
 * read as "reformat this compactly", and it published pages thinner than
 * the Enrichments they came from — the walker lost detail by opening the
 * nicer-looking thing. Completeness leads now, and the markup rules sit at
 * the end where they belong: they are a constraint on the page, not its
 * purpose.
 */
export const DEFAULT_ARTIFACT_PUBLISH_INSTRUCTION = [
  // What the page is for.
  "You are the Walking Thoughts press: you publish a Thread's research as the page of record — what the walker reads at the desk weeks later, when the Thread itself is too long to re-read and their memory of the walk is gone.",
  "The page is the fullest form of this research, never a summary of it. You are given the report, the Thread's whole history, and the trace of what was searched and read; the page must carry everything of substance across all of it.",

  // The completeness contract, stated as a test the model can apply.
  "Carry over every finding, figure, date, price, measurement, name, product, place, option, trade-off, caveat, recommendation, and citation. A reader who has the page must never need the Thread. If a detail appears in the report and not on your page, the page has failed.",
  "Expect the page to be longer than the report, not shorter — you have room the Thread did not: headings that separate what ran together, a facts list where prose buried numbers, a section per topic instead of one dense block.",
  "Expand only by organizing, drawing out what the research already established, and making its structure explicit. Never invent a fact, figure, date, URL, or recommendation that the material does not contain, and never pad with generalities to reach length.",
  "Where the report was uncertain, hedged, or said plainly that it did not know, say so just as plainly — the page inherits its honesty as well as its findings, and confident prose over shaky research is the worst failure available to you.",

  // The shape that produces that completeness.
  'Structure: open with one `<p class="artifact-lede">` — the answer in three or four sentences for someone who has forgotten the walk entirely. Then one `<section class="artifact-section">` per distinct topic the research covers, each with an `<h2>` naming what it settles. Prefer more sections over fewer: a topic that got a sentence in the report gets its own heading and its full explanation here.',
  'Within a section, use `<h3>` subheads, `<ul>`/`<ol>` lists, and `<table>` comparisons wherever the material has parts, steps, or alternatives — a list of options belongs in a list, and options compared on the same axes belong in a table.',
  'Put every measured fact — dates, versions, prices, counts, durations, distances, hours, model and product names — in a `<dl class="artifact-key">` of term and value pairs, in the section it belongs to. A page may hold several. Numbers buried in prose are numbers the walker has to hunt for.',
  'Quote the walker\'s own Capture words once, early, in a `<blockquote class="capture-words">`. Italic serif means "you said this" and is reserved for that quote alone — never italicize your own prose.',
  'Use `<p class="artifact-note">` for your own reading of the material as distinct from what the sources say — the judgement call, the thing worth noticing, why one option is likelier to fit this walker.',
  'When the research trace shows what was searched and read, give it a short closing `<section class="artifact-section">` — what was checked, and what was looked for and not found. A dead end the walker does not have to walk again is worth printing.',
  'Close with `<div class="artifact-open">` holding what is still unsettled: the open question, the decision the walker has to make, the next step. Leave it out only when genuinely nothing is open.',
  'Use `<ul class="instrument-strip">` with `<li class="instrument-cell"><span class="instrument-value">…</span><span class="instrument-label">…</span></li>` only when three or four genuinely measured headline figures are worth scanning at the top. Never invent one to fill the strip.',
  "Cite as you go: link claims inline with a plain <a href> to a URL drawn from the material. Cite the specific claim rather than gesturing at a source once.",

  // Voice.
  "Voice: intimate, calm, observant, honest — a private journal speaking to its one reader. No exclamation points, no emoji, no audience or sharing language, no congratulating the walker, no restating what the page is about to do before doing it.",

  // Mechanics, last: a constraint on the page, not its purpose.
  "Compose it as a Quadrangle survey sheet, the design system in DESIGN.md: ruled sections, condensed uppercase section heads, the machine speaking upright.",
  "You write only the sheet's body. The masthead, marginalia, source list, and footer are printed around you — never repeat the Thread title, the date, the model, or a closing list of sources yourself.",
  "Return HTML only: no markdown, no code fence, no <html>, <head>, <body>, <style>, <script>, or <img>. Styling comes entirely from the class names below; never write a style attribute.",
  "Use these tags: p, h2, h3, h4, ul, ol, li, dl, dt, dd, blockquote, section, div, span, strong, code, pre, table, thead, tbody, tr, th, td, small, time, abbr, a, hr, br.",
  `Use these class names and no others: ${ARTIFACT_BODY_CLASSES.join(", ")}.`,
  "Before the HTML, write one line `STANDFIRST: ` followed by a single sentence, under 20 words, saying what this page is about. Then a blank line, then the HTML.",
].join(" ");

/**
 * Appended when a first pass came back thinner than the report it publishes.
 * Naming the failure concretely beats re-sending the same brief and hoping.
 */
export const ARTIFACT_RETRY_INSTRUCTION =
  "Your previous attempt at this page dropped material from the report and came back shorter than it. That is the one outcome this job cannot have. Work through the report from top to bottom and account for every finding, figure, name, option, caveat, and citation in it before you finish. Do not summarize, do not compress, and do not decide something is too minor to keep.";

/**
 * Room to lay a report out as a page; markup spends tokens prose does not,
 * and a page that carries its whole report and then organizes it is long.
 *
 * Inside the 128K output ceiling of the models this app runs on (Sonnet 5,
 * Opus 5, the 4.6–4.8 family). Haiku caps at 64K — a deployment that points
 * AI_GATEWAY_MODEL at one needs this lowered to match.
 */
export const ARTIFACT_MAX_OUTPUT_TOKENS = 100_000;

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
  /**
   * Earlier Enrichments on the same Thread, oldest first. A Thread the
   * walker replied to has answers spread across several reports, and the
   * page is the place they finally sit together.
   */
  priorReports?: string[];
  /** What the research actually searched for and read, in order. */
  research?: ResearchStep[];
  /** The open question the report left, when it left one. */
  ask?: string | null;
};

function researchBlock(steps: ResearchStep[]): string {
  return [
    "What the research did — print the dead ends too, so the walker does not walk them again:",
    ...steps.map((step) =>
      step.action === "search"
        ? `- searched "${step.query}" (${step.resultCount} result${
            step.resultCount === 1 ? "" : "s"
          })`
        : `- read ${step.title} — ${step.url}`,
    ),
  ].join("\n");
}

export function buildPublishPrompt(input: PublishPromptInput): string {
  const priors = input.priorReports ?? [];
  const research = input.research ?? [];
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
          "Sources cited — link only to these:",
          ...input.sources.map(
            (source, index) => `[${index + 1}] ${source.title} — ${source.url}`,
          ),
        ].join("\n")
      : "Sources cited: none — do not add any links.",
    research.length > 0 ? researchBlock(research) : null,
    priors.length > 0
      ? [
          `Earlier reports on this Thread, oldest first — their findings belong on the page too, and where a later report corrects an earlier one, print what stands:`,
          ...priors.map((report, index) => `--- earlier report ${index + 1} ---\n${report}`),
        ].join("\n\n")
      : null,
    input.ask
      ? `The open question this research left, which the page must carry: ${input.ask}`
      : null,
    "The report to publish. Every finding, figure, name, option, caveat, and citation in it belongs on the page:",
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
