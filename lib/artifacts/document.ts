import { KIND_LABELS } from "@/lib/local-capture/types";
import { ARTIFACT_STYLESHEET } from "./design-system";
import { escapeAttribute } from "./sanitize";
import type { ThreadArtifact } from "./types";

/**
 * The sheet around an Artifact's body: marginalia, masthead, rules, source
 * citations, and the scale-bar footer. Rendered on read rather than stored,
 * so DESIGN.md changes reach every published page at once.
 *
 * Everything here comes from the app's own record — the Thread, the
 * Enrichment, its Sources. The model contributes the body and nothing else,
 * which is why no value below needs escaping beyond the mechanical kind.
 */

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16).replace("T", " ") + "Z";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toUpperCase();
  } catch {
    return "SOURCE";
  }
}

function sourcesBlock(artifact: ThreadArtifact): string {
  if (artifact.sources.length === 0) return "";
  const items = artifact.sources
    .map(
      (source) =>
        `<li><a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer noopener">${escape(
          source.title || hostOf(source.url),
        )}</a></li>`,
    )
    .join("\n        ");
  return `
      <hr class="rule-major" />
      <p class="sheet-sources-head">Sources</p>
      <ol class="sheet-sources">
        ${items}
      </ol>`;
}

/**
 * The whole page as one self-contained document: no script, no external
 * request beyond this origin's two self-hosted display weights.
 */
export function renderArtifactDocument(artifact: ThreadArtifact): string {
  const kindLabel = artifact.kind ? KIND_LABELS[artifact.kind] : "Report";
  const dateLine = formatDate(artifact.createdAt);
  const standfirst = artifact.standfirst
    ? `<p class="masthead-line">${escape(artifact.standfirst)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>${escape(artifact.title)} — Walking Thoughts</title>
<style>
${ARTIFACT_STYLESHEET}
</style>
</head>
<body>
<article class="sheet">
  <header>
    <div class="sheet-marginalia">
      <span>${escape(kindLabel)}</span>
      <span>${escape(dateLine)}</span>
      <span>Sheet 1 of 1</span>
    </div>
    <div class="sheet-masthead">
      <p class="masthead-agency">Walking Thoughts · Provisional Survey</p>
      <h1 class="masthead-title">${escape(artifact.title)}</h1>
      ${standfirst}
    </div>
    <hr class="rule-major" />
  </header>
  <div class="sheet-body">
${artifact.body}
  </div>${sourcesBlock(artifact)}
  <footer>
    <hr class="rule-major" />
    <div class="scale-bar" role="presentation"></div>
    <div class="sheet-footer">
      <span>Published ${escape(formatStamp(artifact.createdAt))}</span>
      <span>${escape(artifact.model)}</span>
    </div>
  </footer>
</article>
</body>
</html>
`;
}

/**
 * The response headers an Artifact is served under. The page is private and
 * carries no script of its own, and the policy says so independently of the
 * sanitizer: styles are inline, fonts are same-origin, and nothing else
 * loads at all.
 */
export const ARTIFACT_RESPONSE_HEADERS: Record<string, string> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "private, no-store",
  "content-security-policy": [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
};
