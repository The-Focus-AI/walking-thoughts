/**
 * Searching the desk. The walker is not looking for a Thread they can
 * already name — they are looking for something that was said, usually by
 * the Enrichment rather than by them ("what did we find out about
 * Remotion?"). So the search reads the reports too, and answers with the
 * line it matched rather than only with a title.
 */

/** Every text a Thread holds, in the order a reader would want a hit from. */
export function matchesQuery(texts: string[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return texts.some((text) => text.toLowerCase().includes(needle));
}

/**
 * The matched line, with enough either side to be worth reading. Cut at
 * word boundaries so a snippet never opens mid-word, and marked with an
 * ellipsis where it was cut.
 */
export function searchSnippet(
  texts: string[],
  query: string,
  radius = 90,
): string | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  for (const text of texts) {
    const at = text.toLowerCase().indexOf(needle);
    if (at === -1) continue;
    const from = Math.max(0, at - radius);
    const to = Math.min(text.length, at + needle.length + radius);
    let excerpt = text.slice(from, to).replace(/\s+/g, " ").trim();
    if (from > 0) {
      // Do not open mid-word.
      const space = excerpt.indexOf(" ");
      if (space > 0 && space < 20) excerpt = excerpt.slice(space + 1);
      excerpt = `…${excerpt}`;
    }
    if (to < text.length) {
      const space = excerpt.lastIndexOf(" ");
      if (space > excerpt.length - 20) excerpt = excerpt.slice(0, space);
      excerpt = `${excerpt}…`;
    }
    return excerpt;
  }
  return null;
}
