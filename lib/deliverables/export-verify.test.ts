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

  it("does not false-positive on real docx binary containing \\n bytes", async () => {
    // Stress: previously OOXML zip bytes matching `\n` failed verify as forbidden:\n
    const { DocxDeliverableGenerator } = await import(
      "./generators/docx-generator"
    );
    const gen = new DocxDeliverableGenerator();
    let failures = 0;
    for (let i = 0; i < 20; i += 1) {
      const body = `# 報告書${i}\n\n## 本文\n${"日本語テスト内容 ".repeat(30 + i)}\n\n・項目A\n・項目B\n\n1.手順一\n2.手順二\n`;
      const file = await gen.generate(body, `報告書${i}`);
      const result = verifyGeneratedExport(file);
      if (!result.ok) failures += 1;
    }
    expect(failures).toBe(0);
  });
});
