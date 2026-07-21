"use client";

/**
 * PROTOTYPE — minimal markdown renderer for Enrichment bodies.
 * Handles the subset the fixture uses: ## headings, lists, bold/italic,
 * inline links, blockquotes. Production would use a real renderer.
 */

import { Fragment, type ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("[")) {
      const split = token.indexOf("](");
      nodes.push(
        <a key={key} href={token.slice(split + 2, -1)} target="_blank" rel="noreferrer">
          {token.slice(1, split)}
        </a>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function ProtoMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = (key: string) => {
    if (!list) return;
    const items = list.items.map((item, itemIndex) => (
      <li key={itemIndex}>{inline(item, `${key}-li${itemIndex}`)}</li>
    ));
    blocks.push(
      list.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>,
    );
    list = null;
  };

  lines.forEach((line, lineIndex) => {
    const key = `b${lineIndex}`;
    const bullet = line.match(/^- (.*)$/);
    const numbered = line.match(/^\d+\. (.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const item = (bullet?.[1] ?? numbered?.[1]) as string;
      if (!list || list.ordered !== ordered) {
        flushList(`${key}-swap`);
        list = { ordered, items: [] };
      }
      list.items.push(item);
      return;
    }
    flushList(key + "-end");
    const heading = line.match(/^(#{2,3}) (.*)$/);
    if (heading) {
      blocks.push(
        heading[1].length === 2 ? (
          <h4 key={key}>{inline(heading[2], key)}</h4>
        ) : (
          <h5 key={key}>{inline(heading[2], key)}</h5>
        ),
      );
    } else if (line.startsWith("> ")) {
      blocks.push(
        <blockquote key={key}>{inline(line.slice(2), key)}</blockquote>,
      );
    } else if (line.trim().length > 0) {
      blocks.push(<p key={key}>{inline(line, key)}</p>);
    }
  });
  flushList("tail");

  return (
    <div className="proto-md">
      {blocks.map((block, blockIndex) => (
        <Fragment key={blockIndex}>{block}</Fragment>
      ))}
    </div>
  );
}
