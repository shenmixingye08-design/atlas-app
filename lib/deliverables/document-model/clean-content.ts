/** Conversational AI preamble / filler lines to drop from exports. */
const CONVERSATION_LINE =
  /^(はい[、。]?|もちろんです[。!！]?|承知(?:いた)?しました[。!！]?|かしこまりました[。!！]?|了解しました[。!！]?|以下に(?:作成|まとめ|記載|整理)(?:しました|します|いたします)[。!！]?|では[、,]?(?:作成|まとめ)(?:します|いたします)[。!！]?|お手伝いします[。!！]?|喜んで[。!！]?)/;

const MARKDOWN_HEADING_ONLY = /^#{1,6}\s*$/;

/**
 * Strip AI chat residue and normalize markdown noise while preserving structure.
 * Does not call any AI APIs.
 */
export function cleanDeliverableSource(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
  const lines = normalized.split("\n");
  const kept: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      kept.push("");
      continue;
    }

    if (CONVERSATION_LINE.test(trimmed)) continue;
    if (MARKDOWN_HEADING_ONLY.test(trimmed)) continue;
    if (/^```/.test(trimmed)) continue;

    kept.push(stripInlineMarkdown(line));
  }

  return collapseBlankLines(kept.join("\n")).trim();
}

export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s?/, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n");
}

/** Detect note / important callouts from plain lines. */
export function matchCalloutLine(
  line: string,
): { variant: "note" | "important" | "warning"; text: string } | null {
  const trimmed = line.trim();
  const patterns: Array<[RegExp, "note" | "important" | "warning"]> = [
    [/^(?:【?注記】?|注[:：]|※)\s*(.+)$/, "note"],
    [/^(?:【?重要】?|ポイント[:：]|ポイント\s*)\s*(.+)$/, "important"],
    [/^(?:【?注意】?|警告[:：]|注意事項[:：])\s*(.+)$/, "warning"],
  ];

  for (const [pattern, variant] of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]?.trim()) {
      return { variant, text: match[1].trim() };
    }
  }

  return null;
}
