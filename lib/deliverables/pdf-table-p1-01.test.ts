/**
 * P1-01: PDF table rendering + fail-closed when tables are omitted.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseDeliverableContent } from "./parse-content";
import {
  assertPdfTablesRendered,
  countSourcePdfTables,
  generatePdfWithTableStats,
  PdfDeliverableGenerator,
} from "./generators/pdf-generator";

const TABLE_MARKDOWN = `# 一覧

## 明細

| ItemCode | Qty | Note |
| --- | --- | --- |
| TBLCELL_ALPHA_991 | 3 | first |
| TBLCELL_BETA_772 | 5 | second |
`;

function extractPdfText(buffer: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "p101-pdf-"));
  const pdfPath = join(dir, "out.pdf");
  try {
    writeFileSync(pdfPath, buffer);
    return execFileSync("pdftotext", ["-enc", "UTF-8", pdfPath, "-"], {
      encoding: "utf8",
      timeout: 15_000,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("P1-01 PDF table render + fail-closed", () => {
  it("parses markdown tables into content blocks", () => {
    const parsed = parseDeliverableContent(TABLE_MARKDOWN);
    expect(countSourcePdfTables(parsed)).toBeGreaterThanOrEqual(1);
    const table = parsed.sections
      .flatMap((s) => s.blocks)
      .find(
        (b) =>
          b.type === "table" && b.headers.includes("ItemCode"),
      );
    expect(table).toMatchObject({
      type: "table",
      headers: ["ItemCode", "Qty", "Note"],
    });
  });

  it("renders table cells into the PDF (not silently omitted)", async () => {
    const { buffer, stats } = await generatePdfWithTableStats(TABLE_MARKDOWN);
    expect(buffer.toString("latin1").startsWith("%PDF")).toBe(true);
    expect(stats.sourceTableCount).toBeGreaterThanOrEqual(1);
    expect(stats.renderedTableCount).toBe(stats.sourceTableCount);

    const text = extractPdfText(buffer);
    // ASCII cell tokens must survive into extractable text.
    expect(text).toContain("TBLCELL_ALPHA_991");
    expect(text).toContain("TBLCELL_BETA_772");
  });

  it("fail-closed: source tables with zero rendered tables throws", () => {
    expect(() =>
      assertPdfTablesRendered({ sourceTableCount: 1, renderedTableCount: 0 }),
    ).toThrow(/pdf_tables_omitted/);
  });

  it("fail-closed: partial table render throws", () => {
    expect(() =>
      assertPdfTablesRendered({ sourceTableCount: 2, renderedTableCount: 1 }),
    ).toThrow(/pdf_tables_partial/);
  });

  it("PDF without tables still succeeds", async () => {
    const markdown = `# Memo\n\n本文だけです。\n`;
    const file = await new PdfDeliverableGenerator().generate(markdown, "memo");
    expect(file.buffer.toString("latin1").startsWith("%PDF")).toBe(true);
    const { stats } = await generatePdfWithTableStats(markdown);
    expect(stats.sourceTableCount).toBe(0);
    expect(stats.renderedTableCount).toBe(0);
  });

  it("generator public API returns valid PDF for table markdown", async () => {
    const file = await new PdfDeliverableGenerator().generate(
      TABLE_MARKDOWN,
      "一覧",
    );
    expect(file.fileName).toBe("一覧.pdf");
    expect(file.buffer.length).toBeGreaterThan(3000);
    const text = extractPdfText(file.buffer);
    expect(text).toContain("TBLCELL_ALPHA_991");
  });

  it("probe metadata keywords prove markers without pdftotext", async () => {
    const { probePdfTableRendering } = await import("./pdf-table-probe");
    const result = await probePdfTableRendering();
    expect(result.ok).toBe(true);
    expect(result.tablesRendered).toBe(true);
    expect(result.markersFound).toBe(true);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.error).toBeNull();
  });
});
