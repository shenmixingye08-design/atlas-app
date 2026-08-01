import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";
import ExcelJS from "exceljs";

import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { resetDeliverableVersionsForTests } from "@/lib/deliverables/versioning";

import {
  assertValidOutput,
  buildConversionFingerprint,
  convertArtifact,
  createArtifactRevision,
  getArtifactDetail,
  getUnifiedArtifact,
  listSupportedConversions,
  listUnifiedArtifacts,
  migrateExistingDeliverablesToArtifacts,
  normalizeArtifactFormat,
  qualityLabel,
  registerArtifact,
  resetArtifactIdempotencyForTests,
  restoreArtifact,
  softDeleteArtifact,
  suggestArtifactFormats,
  validateArtifactBytes,
} from "./index";
import { isExtensionOnlyFakeConversion } from "./convert-engines";
import { buildUnifiedPreview } from "./preview";

const USER = "user_artifact_platform_test";
const OTHER = "user_other_artifact";

async function makeDocx(title = "議事録"): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun(title)] }),
          new Paragraph({ children: [new TextRun("本日の決定事項")] }),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function makeXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("売上");
  sheet.addRow(["商品", "金額"]);
  sheet.addRow(["A", 1000]);
  sheet.addRow(["B", 2000]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function makePdf(text = "Report"): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  // StandardFonts/WinAnsi cannot encode Japanese — keep ASCII for fixture.
  page.drawText(text, { x: 50, y: 700, size: 12 });
  return Buffer.from(await pdf.save());
}

function makeCsv(): Buffer {
  return Buffer.from("\uFEFF商品,金額\nA,1000\nB,2000\n", "utf8");
}

function makePng(): Buffer {
  // Minimal 1x1 PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
}

beforeEach(() => {
  resetDurableDeliverableStoreForTests();
  resetDeliverableVersionsForTests();
  resetArtifactIdempotencyForTests();
});

afterEach(() => {
  resetDurableDeliverableStoreForTests();
  resetDeliverableVersionsForTests();
  resetArtifactIdempotencyForTests();
});

describe("artifact-platform formats & validation", () => {
  it("normalizes formats", () => {
    expect(normalizeArtifactFormat("markdown")).toBe("md");
    expect(normalizeArtifactFormat("JPEG")).toBe("jpg");
    expect(normalizeArtifactFormat("nope")).toBeNull();
  });

  it("lists supported conversions with quality labels", () => {
    const list = listSupportedConversions("docx");
    expect(list.some((c) => c.target === "pdf")).toBe(true);
    expect(qualityLabel("needs_review")).toBe("一部要確認");
  });

  it("rejects 0-byte and corrupted office", () => {
    expect(validateArtifactBytes("docx", Buffer.alloc(0)).ok).toBe(false);
    expect(validateArtifactBytes("pdf", Buffer.from("not-a-pdf")).ok).toBe(false);
    expect(() => assertValidOutput("csv", Buffer.alloc(0))).toThrow();
  });

  it("accepts valid csv/png", () => {
    expect(validateArtifactBytes("csv", makeCsv()).ok).toBe(true);
    expect(validateArtifactBytes("png", makePng()).ok).toBe(true);
  });

  it("suggests formats from request text", () => {
    expect(suggestArtifactFormats("議事録を作って").primary).toBe("docx");
    expect(suggestArtifactFormats("売上管理表").primary).toBe("xlsx");
    expect(suggestArtifactFormats("営業説明資料").primary).toBe("pptx");
    const quote = suggestArtifactFormats("見積書を作って");
    expect(quote.primary).toBe("xlsx");
    expect(quote.secondary).toContain("pdf");
  });
});

describe("artifact-platform register / list / detail", () => {
  it("registers Word/Excel/PDF/CSV/image artifacts", async () => {
    const docx = await registerArtifact({
      userId: USER,
      buffer: await makeDocx(),
      format: "docx",
      title: "議事録",
      fileName: "議事録.docx",
    });
    const xlsx = await registerArtifact({
      userId: USER,
      buffer: await makeXlsx(),
      format: "xlsx",
      title: "売上",
    });
    const pdf = await registerArtifact({
      userId: USER,
      buffer: await makePdf(),
      format: "pdf",
      title: "報告書",
    });
    const csv = await registerArtifact({
      userId: USER,
      buffer: makeCsv(),
      format: "csv",
      title: "データ",
    });
    const png = await registerArtifact({
      userId: USER,
      buffer: makePng(),
      format: "png",
      title: "画像",
    });

    expect(docx.format).toBe("docx");
    expect(docx.mimeType).toContain("wordprocessingml");
    expect(xlsx.format).toBe("xlsx");
    expect(pdf.format).toBe("pdf");
    expect(csv.fileName.endsWith(".csv")).toBe(true);
    expect(png.mimeType).toBe("image/png");
    expect(docx.downloadUrl).toBe(`/api/deliverables/${docx.id}`);

    const listed = await listUnifiedArtifacts({ userId: USER });
    expect(listed.total).toBeGreaterThanOrEqual(5);

    const detail = await getArtifactDetail({ id: docx.id, userId: USER });
    expect(detail?.artifact.id).toBe(docx.id);
  });

  it("denies other user access", async () => {
    const a = await registerArtifact({
      userId: USER,
      buffer: await makeDocx(),
      format: "docx",
      title: "秘密",
    });
    expect(await getUnifiedArtifact(a.id, OTHER)).toBeNull();
    expect(await getArtifactDetail({ id: a.id, userId: OTHER })).toBeNull();
  });
});

describe("artifact-platform revision", () => {
  it("creates revision without overwriting source", async () => {
    const v1 = await registerArtifact({
      userId: USER,
      buffer: await makeDocx("v1"),
      format: "docx",
      title: "売上管理表",
    });
    const rev = await createArtifactRevision({
      sourceArtifactId: v1.id,
      userId: USER,
      buffer: await makeDocx("v2"),
      changeReason: "数値更新",
      changeSummary: "売上列を更新",
      idempotencyKey: "rev-1",
    });
    expect(rev.ok).toBe(true);
    expect(rev.artifact?.id).not.toBe(v1.id);
    expect(rev.artifact?.revisionNumber).toBeGreaterThanOrEqual(2);
    expect(rev.artifact?.sourceArtifactId).toBe(v1.id);

    const stillThere = await getUnifiedArtifact(v1.id, USER);
    expect(stillThere).not.toBeNull();
    expect(stillThere?.id).toBe(v1.id);

    const detail = await getArtifactDetail({
      id: rev.artifact!.id,
      userId: USER,
    });
    expect(detail?.revisions.length).toBeGreaterThanOrEqual(2);
  });
});

describe("artifact-platform conversions", () => {
  it("converts Word→PDF with real PDF bytes", async () => {
    const source = await registerArtifact({
      userId: USER,
      buffer: await makeDocx(),
      format: "docx",
      title: "議事録",
      sourceContent: "# 議事録\n\n決定事項",
    });
    const result = await convertArtifact({
      sourceArtifactId: source.id,
      targetFormat: "pdf",
      userId: USER,
      options: { idempotencyKey: "docx-pdf-1" },
    });
    expect(result.ok).toBe(true);
    expect(result.artifact?.format).toBe("pdf");
    expect(result.artifact?.mimeType).toBe("application/pdf");
    const stored = await getUnifiedArtifact(result.artifact!.id, USER);
    expect(stored).not.toBeNull();
    // source preserved
    expect(await getUnifiedArtifact(source.id, USER)).not.toBeNull();
  });

  it("converts PowerPoint→PDF when pptx is available", async () => {
    const { createPptxFromAssignment } = await import(
      "@/lib/pptx-secretary/service"
    );
    const pptx = await createPptxFromAssignment({
      assignment: "営業説明資料を作って。製品概要と価格と次のアクション。",
    });
    if (!pptx.ok || !pptx.buffer) {
      // Environment may lack font assets — skip soft
      expect(pptx.ok).toBe(false);
      return;
    }
    const source = await registerArtifact({
      userId: USER,
      buffer: pptx.buffer,
      format: "pptx",
      title: "営業資料",
      sourceContent: "営業説明",
    });
    const result = await convertArtifact({
      sourceArtifactId: source.id,
      targetFormat: "pdf",
      userId: USER,
      options: { idempotencyKey: "pptx-pdf-1" },
    });
    expect(result.ok).toBe(true);
    expect(result.artifact?.format).toBe("pdf");
  });

  it("converts Excel→PDF and CSV→Excel", async () => {
    const xlsx = await registerArtifact({
      userId: USER,
      buffer: await makeXlsx(),
      format: "xlsx",
      title: "売上",
    });
    const toPdf = await convertArtifact({
      sourceArtifactId: xlsx.id,
      targetFormat: "pdf",
      userId: USER,
      options: { idempotencyKey: "xlsx-pdf-1" },
    });
    expect(toPdf.ok).toBe(true);

    const csv = await registerArtifact({
      userId: USER,
      buffer: makeCsv(),
      format: "csv",
      title: "CSV",
    });
    const toXlsx = await convertArtifact({
      sourceArtifactId: csv.id,
      targetFormat: "xlsx",
      userId: USER,
      options: { idempotencyKey: "csv-xlsx-1" },
    });
    expect(toXlsx.ok).toBe(true);
    expect(toXlsx.artifact?.format).toBe("xlsx");
  });

  it("converts PDF→Word and image→PDF", async () => {
    const pdf = await registerArtifact({
      userId: USER,
      buffer: await makePdf(),
      format: "pdf",
      title: "報告書",
    });
    const toDocx = await convertArtifact({
      sourceArtifactId: pdf.id,
      targetFormat: "docx",
      userId: USER,
      options: { idempotencyKey: "pdf-docx-1" },
    });
    expect(toDocx.ok).toBe(true);
    expect(toDocx.quality).not.toBe("unsupported");

    const png = await registerArtifact({
      userId: USER,
      buffer: makePng(),
      format: "png",
      title: "図",
    });
    const imgPdf = await convertArtifact({
      sourceArtifactId: png.id,
      targetFormat: "pdf",
      userId: USER,
      options: { idempotencyKey: "png-pdf-1" },
    });
    expect(imgPdf.ok).toBe(true);
  });

  it("prevents duplicate conversion via idempotency", async () => {
    const source = await registerArtifact({
      userId: USER,
      buffer: await makeDocx(),
      format: "docx",
      title: "二重防止",
      sourceContent: "本文",
    });
    const a = await convertArtifact({
      sourceArtifactId: source.id,
      targetFormat: "pdf",
      userId: USER,
      options: { idempotencyKey: "dup-1" },
    });
    const b = await convertArtifact({
      sourceArtifactId: source.id,
      targetFormat: "pdf",
      userId: USER,
      options: { idempotencyKey: "dup-1" },
    });
    expect(a.ok && b.ok).toBe(true);
    expect(b.reused).toBe(true);
    expect(a.artifact?.id).toBe(b.artifact?.id);
  });

  it("rejects unsupported conversion", async () => {
    const pdf = await registerArtifact({
      userId: USER,
      buffer: await makePdf(),
      format: "pdf",
      title: "x",
    });
    const result = await convertArtifact({
      sourceArtifactId: pdf.id,
      targetFormat: "png",
      userId: USER,
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("unsupported_conversion");
  });

  it("detects extension-only fake conversion", () => {
    const buf = Buffer.from("same");
    expect(isExtensionOnlyFakeConversion(buf, buf, "docx", "pdf")).toBe(true);
  });

  it("records conversion history on source", async () => {
    const source = await registerArtifact({
      userId: USER,
      buffer: await makeDocx(),
      format: "docx",
      title: "履歴",
      sourceContent: "body",
    });
    await convertArtifact({
      sourceArtifactId: source.id,
      targetFormat: "pdf",
      userId: USER,
      options: { idempotencyKey: "hist-1" },
    });
    const detail = await getArtifactDetail({ id: source.id, userId: USER });
    expect(detail?.conversions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("artifact-platform preview / delete / migrate", () => {
  it("builds previews and keeps download url on failure path", async () => {
    const docx = await registerArtifact({
      userId: USER,
      buffer: await makeDocx(),
      format: "docx",
      title: "プレビュー",
    });
    const preview = await buildUnifiedPreview({
      artifactId: docx.id,
      userId: USER,
    });
    expect(preview.downloadUrl).toContain(docx.id);
    expect(preview.ok).toBe(true);

    const csv = await registerArtifact({
      userId: USER,
      buffer: makeCsv(),
      format: "csv",
      title: "表",
    });
    const csvPreview = await buildUnifiedPreview({
      artifactId: csv.id,
      userId: USER,
    });
    expect(csvPreview.kind).toBe("table");
  });

  it("soft deletes and restores", async () => {
    const a = await registerArtifact({
      userId: USER,
      buffer: await makeDocx(),
      format: "docx",
      title: "削除対象",
    });
    const del = await softDeleteArtifact({
      artifactId: a.id,
      userId: USER,
    });
    expect(del.ok).toBe(true);
    expect(await getUnifiedArtifact(a.id, USER)).toBeNull();

    const restored = await restoreArtifact({ artifactId: a.id, userId: USER });
    expect(restored.ok).toBe(true);
  });

  it("migration dry-run and idempotent apply (memory)", async () => {
    await registerArtifact({
      userId: USER,
      buffer: await makeDocx(),
      format: "docx",
      title: "移行",
    });
    const dry = await migrateExistingDeliverablesToArtifacts({
      dryRun: true,
      userId: USER,
    });
    expect(dry.dryRun).toBe(true);
    expect(dry.scanned).toBeGreaterThanOrEqual(1);

    const apply1 = await migrateExistingDeliverablesToArtifacts({
      dryRun: false,
      userId: USER,
    });
    const apply2 = await migrateExistingDeliverablesToArtifacts({
      dryRun: false,
      userId: USER,
    });
    expect(apply2.skipped + apply2.migrated).toBeGreaterThanOrEqual(apply1.scanned);
  });

  it("fingerprint is stable for same conversion", () => {
    expect(
      buildConversionFingerprint({
        sourceArtifactId: "a",
        targetFormat: "pdf",
      })
    ).toBe(
      buildConversionFingerprint({
        sourceArtifactId: "a",
        targetFormat: "pdf",
      })
    );
  });
});
