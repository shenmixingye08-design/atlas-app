/**
 * Normalize tweet text for reliable posting:
 * - Preserve intentional newlines (convert CRLF → LF)
 * - Collapse excessive blank lines
 * - Normalize hashtag spacing
 * - Leave URLs intact (validated separately)
 */
export function normalizeTweetText(text: string): string {
  let next = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  next = next.replace(/[ \t]+\n/g, "\n");
  next = next.replace(/\n{3,}/g, "\n\n");
  next = next.replace(/[ \t]{2,}/g, " ");
  // Ensure hashtags are separated from adjacent CJK/latin without spaces when glued oddly
  next = next.replace(/([^\s#])#([\p{L}\p{N}_]+)/gu, "$1 #$2");
  return next.trim();
}

export function extractHashtagsNormalized(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)) {
    const tag = match[2];
    if (tag) tags.push(`#${tag}`);
  }
  return [...new Set(tags)];
}

export function extractUrlsNormalized(text: string): string[] {
  const pattern =
    /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;
  return [...text.matchAll(pattern)].map((m) => m[0] ?? "").filter(Boolean);
}
