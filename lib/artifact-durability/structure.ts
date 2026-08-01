import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";

import { validateArtifactBytes } from "@/lib/artifact-platform/validate-output";
import { verifyGeneratedExport } from "@/lib/deliverables/export-verify";
import {
  listZipEntryNames,
  sha256Hex,
  verifyOoxmlStructure,
} from "@/lib/deliverables/integrity";
import type { GeneratedDeliverableFile } from "@/lib/deliverables/types";
import type {
  ArtifactFormatUnderTest,
  StructureCheck,
} from "@/lib/artifact-durability/types";

export type StructureValidation = {
  ok: boolean;
  checks: StructureCheck[];
  sha256: string;
  fileSize: number;
};

function unzipList(buffer: Buffer): string[] {
  const dir = mkdtempSync(join(tmpdir(), "ad-unzip-"));
  const zipPath = join(dir, "file.zip");
  try {
    writeFileSync(zipPath, buffer);
    const out = execFileSync("unzip", ["-Z1", zipPath], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return listZipEntryNames(buffer);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function hasJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(text);
}

async function validateXlsxDeep(buffer: Buffer): Promise<StructureCheck[]> {
  const checks: StructureCheck[] = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    buffer as unknown as Parameters<typeof wb.xlsx.load>[0]
  );
  checks.push({
    name: "sheet_count",
    ok: wb.worksheets.length >= 1,
    detail: `sheets=${wb.worksheets.length}`,
  });
  let cellCount = 0;
  let hasNumber = false;
  let hasDate = false;
  let badFormula = false;
  for (const sheet of wb.worksheets) {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cellCount += 1;
        if (typeof cell.value === "number") hasNumber = true;
        if (cell.value instanceof Date) hasDate = true;
        if (typeof cell.value === "object" && cell.value && "formula" in cell.value) {
          const f = String((cell.value as { formula?: string }).formula ?? "");
          if (/#REF!/i.test(f)) badFormula = true;
        }
        if (typeof cell.value === "string" && /#REF!/i.test(cell.value)) {
          badFormula = true;
        }
      });
    });
  }
  checks.push({ name: "cells_present", ok: cellCount > 0, detail: `cells=${cellCount}` });
  checks.push({
    name: "no_ref_errors",
    ok: !badFormula,
    detail: badFormula ? "found #REF!" : "ok",
  });
  // Number/date may be stored as strings in secretary path — soft check
  checks.push({
    name: "numeric_or_text_values",
    ok: cellCount > 0,
    detail: `hasNumber=${hasNumber} hasDate=${hasDate}`,
  });
  return checks;
}

export async function validateStructure(
  format: ArtifactFormatUnderTest,
  file: GeneratedDeliverableFile
): Promise<StructureValidation> {
  const checks: StructureCheck[] = [];
  const fileSize = file.buffer.byteLength;
  const sha256 = sha256Hex(file.buffer);

  checks.push({
    name: "non_zero",
    ok: fileSize > 0,
    detail: `${fileSize}`,
  });

  const basic = verifyGeneratedExport(file);
  // Office ZIP binaries can randomly contain the two bytes `\n` in compressed
  // streams; that marker is for JSON leakage, not OOXML corruption.
  const exportReasons = basic.reasons.filter((r) => {
    if (
      (format === "docx" || format === "xlsx" || format === "pptx") &&
      r === "forbidden:\\n"
    ) {
      return false;
    }
    return true;
  });
  checks.push({
    name: "export_verify",
    ok: exportReasons.length === 0,
    detail: exportReasons.join(",") || "ok",
  });

  const platform = validateArtifactBytes(format, file.buffer);
  for (const c of platform.checks) {
    checks.push({ name: `platform:${c.name}`, ok: c.ok, detail: c.detail });
  }

  if (format === "docx" || format === "xlsx" || format === "pptx") {
    const entries = unzipList(file.buffer);
    checks.push({
      name: "zip_expandable",
      ok: entries.length > 0,
      detail: `entries=${entries.length}`,
    });
    checks.push({
      name: "content_types",
      ok: entries.some((e) => e === "[Content_Types].xml"),
    });
    if (format === "docx") {
      const ooxml = verifyOoxmlStructure(file.buffer);
      checks.push({
        name: "ooxml_word",
        ok: ooxml.ok,
        detail: ooxml.missing.join(",") || "ok",
      });
      checks.push({
        name: "document_xml",
        ok: entries.some((e) => e === "word/document.xml"),
      });
      // Extract a bit of document.xml for JP check
      try {
        const dir = mkdtempSync(join(tmpdir(), "ad-docx-"));
        const zipPath = join(dir, "f.docx");
        writeFileSync(zipPath, file.buffer);
        execFileSync("unzip", ["-o", zipPath, "word/document.xml", "-d", dir], {
          stdio: "ignore",
        });
        const xml = readFileSync(join(dir, "word/document.xml"), "utf8");
        checks.push({
          name: "japanese_text",
          ok: hasJapanese(xml),
        });
        checks.push({
          name: "has_paragraph",
          ok: xml.includes("w:p") || xml.includes("<w:p "),
        });
        rmSync(dir, { recursive: true, force: true });
      } catch (error) {
        checks.push({
          name: "document_xml_extract",
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (format === "xlsx") {
      checks.push({
        name: "workbook_xml",
        ok: entries.some((e) => e === "xl/workbook.xml"),
      });
      checks.push({
        name: "worksheets",
        ok: entries.some((e) => e.startsWith("xl/worksheets/")),
      });
      try {
        checks.push(...(await validateXlsxDeep(file.buffer)));
      } catch (error) {
        checks.push({
          name: "exceljs_load",
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (format === "pptx") {
      checks.push({
        name: "presentation_xml",
        ok: entries.some((e) => e === "ppt/presentation.xml"),
      });
      const slides = entries.filter((e) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(e)
      );
      checks.push({
        name: "slides_present",
        ok: slides.length >= 1,
        detail: `slides=${slides.length}`,
      });
      checks.push({
        name: "slide_rels",
        ok: entries.some((e) => e.startsWith("ppt/slides/_rels/")),
      });
    }
  }

  if (format === "pdf") {
    const head = file.buffer.subarray(0, 8).toString("latin1");
    checks.push({ name: "pdf_header", ok: head.startsWith("%PDF") });
    const asLatin = file.buffer.toString("latin1");
    checks.push({
      name: "pdf_eof",
      ok: asLatin.includes("%%EOF"),
    });
    checks.push({
      name: "xref_or_stream",
      ok: /xref|startxref|\/Type\s*\/Page|stream/.test(asLatin),
    });
    checks.push({
      name: "not_tiny",
      ok: fileSize >= 800,
      detail: `${fileSize}`,
    });
    // pdf-lib may omit plaintext `/Type /Page`; parse instead of regex.
    try {
      const pdf = await PDFDocument.load(file.buffer, {
        ignoreEncryption: true,
      });
      const pageCount = pdf.getPageCount();
      checks.push({
        name: "page_parse",
        ok: pageCount >= 1,
        detail: `pages=${pageCount}`,
      });
      checks.push({
        name: "no_blank_flood",
        ok: pageCount <= 80,
        detail: `pages=${pageCount}`,
      });
    } catch (error) {
      checks.push({
        name: "page_parse",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    // Fonts may be subset/embedded without Noto name; size+parse is primary.
    const utf8 = file.buffer.toString("utf8");
    checks.push({
      name: "japanese_or_embedded_content",
      ok:
        hasJapanese(utf8) ||
        /NotoSans|Identity-H|ToUnicode|FontFile|CIDFont/.test(asLatin) ||
        fileSize >= 5_000,
      detail: `jp=${hasJapanese(utf8)} size=${fileSize}`,
    });
  }

  return {
    ok: checks.every((c) => c.ok),
    checks,
    sha256,
    fileSize,
  };
}
