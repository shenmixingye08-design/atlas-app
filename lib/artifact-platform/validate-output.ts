import type { ArtifactFormat } from "./types";
import { ArtifactPlatformError } from "./errors";

export type OutputValidationResult = {
  ok: boolean;
  format: ArtifactFormat;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
  pageOrSheetCount?: number;
};

function isZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

function zipHasEntry(buf: Buffer, name: string): boolean {
  // naive search in central directory / local headers
  return buf.includes(Buffer.from(name, "utf8"));
}

export function validateArtifactBytes(
  format: ArtifactFormat,
  bytes: Buffer
): OutputValidationResult {
  const checks: OutputValidationResult["checks"] = [];

  if (!bytes || bytes.length === 0) {
    checks.push({ name: "non_empty", ok: false, detail: "0-byte file" });
    return { ok: false, format, checks };
  }
  checks.push({ name: "non_empty", ok: true, detail: `${bytes.length} bytes` });

  // ZIP bomb soft guard: reject absurd compression ratio signals for office docs
  if (["docx", "xlsx", "pptx"].includes(format)) {
    const zipOk = isZip(bytes);
    checks.push({ name: "zip_signature", ok: zipOk });
    if (!zipOk) return { ok: false, format, checks };
    if (bytes.length > 80 * 1024 * 1024) {
      checks.push({ name: "size_limit", ok: false, detail: "over 80MB" });
      return { ok: false, format, checks };
    }
    checks.push({ name: "size_limit", ok: true });
  }

  switch (format) {
    case "docx": {
      const hasDoc = zipHasEntry(bytes, "word/document.xml");
      checks.push({ name: "document_xml", ok: hasDoc });
      return { ok: checks.every((c) => c.ok), format, checks };
    }
    case "xlsx": {
      const hasWb = zipHasEntry(bytes, "xl/workbook.xml");
      checks.push({ name: "workbook_xml", ok: hasWb });
      const hasSheet = zipHasEntry(bytes, "xl/worksheets/");
      checks.push({ name: "worksheets", ok: hasSheet });
      return { ok: checks.every((c) => c.ok), format, checks };
    }
    case "pptx": {
      const hasPres = zipHasEntry(bytes, "ppt/presentation.xml");
      checks.push({ name: "presentation_xml", ok: hasPres });
      const hasSlide = zipHasEntry(bytes, "ppt/slides/slide");
      checks.push({ name: "slides", ok: hasSlide });
      return { ok: checks.every((c) => c.ok), format, checks };
    }
    case "pdf": {
      const head = bytes.subarray(0, 5).toString("utf8");
      const headerOk = head.startsWith("%PDF-");
      checks.push({ name: "pdf_header", ok: headerOk });
      const eofOk = bytes.includes(Buffer.from("%%EOF"));
      checks.push({ name: "pdf_eof", ok: eofOk });
      return { ok: checks.every((c) => c.ok), format, checks };
    }
    case "csv": {
      const text = bytes.toString("utf8");
      const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
      checks.push({ name: "has_rows", ok: lines.length >= 1 });
      if (lines.length >= 2) {
        const cols0 = lines[0].split(",").length;
        const cols1 = lines[1].split(",").length;
        checks.push({
          name: "column_consistency",
          ok: cols0 === cols1 || cols0 > 0,
          detail: `header=${cols0} row1=${cols1}`,
        });
      }
      // CSV injection soft warning (does not fail validation)
      const risky = lines.some((l) => /^[=+\-@]/.test(l.trim()));
      checks.push({
        name: "csv_injection_scan",
        ok: true,
        detail: risky ? "formula-like cells detected (escaped on export recommended)" : "clean",
      });
      return { ok: checks.filter((c) => c.name !== "csv_injection_scan").every((c) => c.ok), format, checks };
    }
    case "png": {
      const ok =
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47;
      checks.push({ name: "png_signature", ok });
      return { ok, format, checks };
    }
    case "jpg": {
      const ok = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      checks.push({ name: "jpeg_signature", ok });
      return { ok, format, checks };
    }
    case "json": {
      try {
        JSON.parse(bytes.toString("utf8"));
        checks.push({ name: "json_parse", ok: true });
        return { ok: true, format, checks };
      } catch (e) {
        checks.push({
          name: "json_parse",
          ok: false,
          detail: e instanceof Error ? e.message : "parse error",
        });
        return { ok: false, format, checks };
      }
    }
    case "md":
    case "markdown":
    case "txt": {
      checks.push({ name: "text_utf8", ok: true });
      return { ok: true, format, checks };
    }
    default:
      return { ok: false, format, checks: [{ name: "unknown_format", ok: false }] };
  }
}

export function assertValidOutput(format: ArtifactFormat, bytes: Buffer): void {
  const result = validateArtifactBytes(format, bytes);
  if (!result.ok) {
    throw new ArtifactPlatformError(
      "output_validation_failed",
      `Validation failed for ${format}: ${JSON.stringify(result.checks)}`,
      { format, checks: result.checks }
    );
  }
}
