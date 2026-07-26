import { describe, expect, it } from "vitest";

import { verifyGeneratedExport } from "./export-verify";

describe("verifyGeneratedExport", () => {
  it("rejects empty pdf", () => {
    const result = verifyGeneratedExport({
      fileName: "a.pdf",
      format: "pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF"),
      isPlaceholder: false,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects json leakage in text exports", () => {
    const result = verifyGeneratedExport({
      fileName: "a.md",
      format: "md",
      mimeType: "text/markdown",
      buffer: Buffer.from('hello "type": "x" "content": "y"'),
      isPlaceholder: false,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.startsWith("forbidden"))).toBe(true);
  });

  it("accepts zip-shaped docx of reasonable size", () => {
    const buf = Buffer.concat([
      Buffer.from("PK"),
      Buffer.alloc(2000, 1),
    ]);
    const result = verifyGeneratedExport({
      fileName: "a.docx",
      format: "docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: buf,
      isPlaceholder: false,
    });
    expect(result.ok).toBe(true);
  });
});
