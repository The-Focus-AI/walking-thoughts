import { sanitizeArtifactHtml } from "./sanitize";

/**
 * The Enrichment's own markdown as page markup. This is the floor a
 * published Artifact can never fall below: if the press comes back with
 * something thinner than the report, the walker gets the report itself,
 * laid out on the sheet. Worse than a good page; never worse than the
 * Thread.
 *
 * Deliberately a small converter rather than a rendering pipeline: it
 * handles the subset the Enrichment instruction actually asks for — short
 * paragraphs, bold key facts, bullet and numbered lists, headings, inline
 * links and code — and everything it does not recognize survives as text.
 */

function inline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, (_, code: string) => `<code>${code}</code>`)
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, label: string, url: string) => `<a href="${url}">${label}</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, (_, bold: string) => `<strong>${bold}</strong>`)
    .replace(/__([^_]+)__/g, (_, bold: string) => `<strong>${bold}</strong>`);
}

type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "paragraph"; text: string };

function readBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({
        kind: "heading",
        // Every Enrichment heading sits under the page's own masthead, so
        // the shallowest it can be is h2.
        level: heading[1].length <= 2 ? 2 : 3,
        text: heading[2].trim(),
      });
      index += 1;
      continue;
    }

    const bullet = /^\s*[-*+]\s+(.*)$/;
    const numbered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = !bullet.test(line);
      const pattern = ordered ? numbered : bullet;
      const items: string[] = [];
      while (index < lines.length && pattern.test(lines[index])) {
        items.push(lines[index].match(pattern)![1].trim());
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", text: quoted.join(" ").trim() });
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim().length > 0 &&
      !/^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|\s*>)/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function renderBlock(block: Block, position: number): string {
  switch (block.kind) {
    case "heading":
      return `<h${block.level}>${inline(block.text)}</h${block.level}>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items
        .map((item) => `<li>${inline(item)}</li>`)
        .join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "quote":
      return `<blockquote>${inline(block.text)}</blockquote>`;
    case "paragraph":
      // The opening paragraph is the page's lede wherever it came from.
      return position === 0
        ? `<p class="artifact-lede">${inline(block.text)}</p>`
        : `<p>${inline(block.text)}</p>`;
  }
}

/** The report itself, as sanitized page markup. */
export function reportToArtifactBody(report: string): string {
  const blocks = readBlocks(report.trim());
  if (blocks.length === 0) return "";
  return sanitizeArtifactHtml(
    blocks.map((block, position) => renderBlock(block, position)).join("\n"),
  );
}
