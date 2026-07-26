/**
 * An Artifact body is HTML a model wrote, served from this origin to the
 * walker's authenticated session. It is re-emitted, never passed through:
 * the scanner below reads the model's markup and writes a fresh document
 * from an allowlist of tags and attributes, escaping everything else. Any
 * construct it does not recognize cannot reach the page.
 *
 * The route that serves an Artifact also sets a script-free CSP. Both hold;
 * neither is trusted alone.
 */

/** Tags an Artifact may use, with the attributes each may carry. */
const ALLOWED_TAGS: Record<string, readonly string[]> = {
  p: ["class"],
  h2: ["class", "id"],
  h3: ["class", "id"],
  h4: ["class", "id"],
  ul: ["class"],
  ol: ["class", "start"],
  li: ["class"],
  dl: ["class"],
  dt: ["class"],
  dd: ["class"],
  blockquote: ["class"],
  section: ["class"],
  div: ["class"],
  span: ["class"],
  figure: ["class"],
  figcaption: ["class"],
  strong: ["class"],
  em: ["class"],
  code: ["class"],
  pre: ["class"],
  a: ["class", "href"],
  table: ["class"],
  thead: ["class"],
  tbody: ["class"],
  tr: ["class"],
  th: ["class", "colspan", "rowspan", "scope"],
  td: ["class", "colspan", "rowspan"],
  small: ["class"],
  time: ["class", "datetime"],
  abbr: ["class"],
  br: [],
  hr: ["class"],
};

const VOID_TAGS = new Set(["br", "hr"]);

/**
 * Tags dropped with everything inside them. Unknown tags are unwrapped so
 * their text survives; these carry payloads, not prose, so their contents go
 * with them.
 */
const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "noscript",
  "template",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "svg",
  "math",
  "head",
  "title",
  "link",
  "meta",
  "base",
  "audio",
  "video",
  "img",
  "picture",
  "source",
  "canvas",
]);

/** Only schemes a walker can safely follow out of the page. */
const SAFE_HREF = /^(?:https?:\/\/|mailto:)/i;

/** Backstops: a runaway generation must not become an unreadable page. */
const MAX_BODY_LENGTH = 200_000;
const MAX_DEPTH = 24;

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

type ScannedTag = {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attributes: string;
  end: number;
};

/**
 * Read one tag starting at `<`. Quote-aware, so a `>` inside an attribute
 * value does not end the tag early — the classic way a naive splitter lets
 * markup escape.
 */
function scanTag(input: string, start: number): ScannedTag | null {
  let index = start + 1;
  let closing = false;
  if (input[index] === "/") {
    closing = true;
    index += 1;
  }
  const nameStart = index;
  while (index < input.length && /[a-zA-Z0-9-]/.test(input[index])) index += 1;
  const name = input.slice(nameStart, index).toLowerCase();
  if (!name) return null;

  const attributeStart = index;
  let quote: string | null = null;
  while (index < input.length) {
    const char = input[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      break;
    }
    index += 1;
  }
  const attributes = input.slice(attributeStart, index);
  return {
    name,
    closing,
    selfClosing: attributes.trimEnd().endsWith("/"),
    attributes,
    end: index < input.length ? index + 1 : input.length,
  };
}

const ATTRIBUTE_PATTERN =
  /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;

function readAttributes(raw: string): Map<string, string> {
  const found = new Map<string, string>();
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_PATTERN.exec(raw)) !== null) {
    const name = match[1].toLowerCase();
    const rawValue = match[2] ?? "";
    const value =
      rawValue.startsWith('"') || rawValue.startsWith("'")
        ? rawValue.slice(1, -1)
        : rawValue;
    if (!found.has(name)) found.set(name, value);
  }
  return found;
}

/**
 * `javascript:` and friends hide behind entities, tabs, and newlines, so the
 * value is decoded and stripped of whitespace before the scheme is checked.
 */
function isSafeHref(value: string): boolean {
  const decoded = value
    .replace(/&#(\d+);?/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);?/gi, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16)),
    )
    .replace(/&amp;/gi, "&")
    // Whitespace and control characters only — a scheme may not hide in them.
    .replace(/[\s\u0000-\u001f]/g, "");
  return SAFE_HREF.test(decoded);
}

function renderAttributes(
  tag: string,
  attributes: Map<string, string>,
): string {
  const allowed = ALLOWED_TAGS[tag] ?? [];
  const parts: string[] = [];
  for (const name of allowed) {
    const value = attributes.get(name);
    if (value === undefined) continue;
    if (name === "href") {
      if (!isSafeHref(value)) continue;
      parts.push(` href="${escapeAttribute(value.trim())}"`);
      // Nothing in an Artifact links inward, and the walker's page must not
      // hand its URL to whatever it cites.
      parts.push(' target="_blank" rel="noreferrer noopener"');
      continue;
    }
    if (value === "") continue;
    parts.push(` ${name}="${escapeAttribute(value)}"`);
  }
  return parts.join("");
}

/** Skip past `</name>`, or to the end when the model never closed it. */
function skipElement(input: string, from: number, name: string): number {
  const pattern = new RegExp(`</\\s*${name}\\s*>`, "i");
  const rest = input.slice(from);
  const match = pattern.exec(rest);
  return match ? from + match.index + match[0].length : input.length;
}

/**
 * Rewrite model HTML as an Artifact body: allowlisted tags with allowlisted
 * attributes, everything else escaped or unwrapped, tags balanced on the way
 * out. Returns markup safe to place inside the sheet.
 */
export function sanitizeArtifactHtml(raw: string): string {
  const input = raw.slice(0, MAX_BODY_LENGTH);
  const out: string[] = [];
  const open: string[] = [];
  let index = 0;

  while (index < input.length) {
    const next = input.indexOf("<", index);
    if (next === -1) {
      out.push(escapeText(input.slice(index)));
      break;
    }
    if (next > index) out.push(escapeText(input.slice(index, next)));

    if (input.startsWith("<!--", next)) {
      const close = input.indexOf("-->", next + 4);
      index = close === -1 ? input.length : close + 3;
      continue;
    }
    if (input.startsWith("<!", next) || input.startsWith("<?", next)) {
      const close = input.indexOf(">", next);
      index = close === -1 ? input.length : close + 1;
      continue;
    }

    const tag = scanTag(input, next);
    if (!tag) {
      // A bare `<` in prose. Keep it as text.
      out.push(escapeText("<"));
      index = next + 1;
      continue;
    }
    index = tag.end;

    if (DROP_WITH_CONTENT.has(tag.name)) {
      if (!tag.closing && !tag.selfClosing) {
        index = skipElement(input, index, tag.name);
      }
      continue;
    }

    const allowed = tag.name in ALLOWED_TAGS;

    if (tag.closing) {
      if (!allowed) continue;
      const depth = open.lastIndexOf(tag.name);
      if (depth === -1) continue;
      while (open.length > depth) out.push(`</${open.pop()}>`);
      continue;
    }

    // Unknown tags are unwrapped: the markup goes, the words stay.
    if (!allowed) continue;

    const attributes = renderAttributes(tag.name, readAttributes(tag.attributes));
    if (VOID_TAGS.has(tag.name)) {
      out.push(`<${tag.name}${attributes} />`);
      continue;
    }
    if (open.length >= MAX_DEPTH) continue;
    out.push(`<${tag.name}${attributes}>`);
    if (!tag.selfClosing) open.push(tag.name);
    else out.push(`</${tag.name}>`);
  }

  while (open.length > 0) out.push(`</${open.pop()}>`);
  return out.join("").trim();
}
