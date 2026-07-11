/** Best-effort text extraction from PDF bytes (no extra dependency). */
export function extractTextFromPdfBuffer(buffer: Buffer): string {
  const asLatin1 = buffer.toString("latin1");
  const chunks: string[] = [];

  const btEt = asLatin1.matchAll(/BT([\s\S]*?)ET/g);
  for (const match of btEt) {
    const block = match[1] ?? "";
    const literals = block.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g);
    for (const lit of literals) {
      const raw = lit[0].replace(/\s*Tj$/, "");
      const inner = raw.slice(1, -1);
      const decoded = inner
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
      if (decoded.trim()) chunks.push(decoded);
    }
  }

  if (chunks.length === 0) {
    const readable = asLatin1
      .replace(/[^\x20-\x7E\u3040-\u30FF\u4E00-\u9FFF\n\r\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return readable.slice(0, 12000);
  }

  return chunks.join("\n").slice(0, 12000);
}
