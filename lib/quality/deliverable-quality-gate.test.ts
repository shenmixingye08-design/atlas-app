/**
 * Phase 4 quality gate: generate real Word/Excel/PDF/PowerPoint binaries
 * and verify openability, MIME, download registration, preview, revision, convert.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { resetDeliverableVersionsForTests } from "@/lib/deliverables/versioning";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { createPptxFromAssignment } from "@/lib/pptx-secretary/service";
import {
  convertArtifact,
  createArtifactRevision,
  getArtifactDetail,
  listUnifiedArtifacts,
  registerArtifact,
  resetArtifactIdempotencyForTests,
  buildUnifiedPreview,
  validateArtifactBytes,
} from "@/lib/artifact-platform";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";

const USER = "qa_deliverable_quality_user";

const SAMPLE_MD = `# 品質確認資料

## 概要
MINERVOT品質ゲート用のサンプル本文です。

## 数値
| 項目 | 金額 |
| --- | ---: |
| A商品 | 1200 |
| B商品 | 3400 |

## 結論
文字化けなく開けること。
`;

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

describe("deliverable quality gate (Word/Excel/PDF/PPTX)", () => {
  it("generates openable Word/Excel/PDF and registers artifacts", async () => {
    const docx = await new DocxDeliverableGenerator().generate(
      SAMPLE_MD,
      "品質確認_議事録",
    );
    const xlsx = await new XlsxDeliverableGenerator().generate(
      SAMPLE_MD,
      "品質確認_売上",
    );
    const pdf = await new PdfDeliverableGenerator().generate(
      SAMPLE_MD,
      "品質確認_報告書",
    );

    expect(docx.buffer.byteLength).toBeGreaterThan(1000);
    expect(xlsx.buffer.byteLength).toBeGreaterThan(1000);
    expect(pdf.buffer.byteLength).toBeGreaterThan(500);
    expect(docx.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(xlsx.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(pdf.buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-");

    expect(validateArtifactBytes("docx", docx.buffer).ok).toBe(true);
    expect(validateArtifactBytes("xlsx", xlsx.buffer).ok).toBe(true);
    expect(validateArtifactBytes("pdf", pdf.buffer).ok).toBe(true);

    const aDocx = await registerArtifact({
      userId: USER,
      buffer: docx.buffer,
      format: "docx",
      title: "品質確認_議事録",
      fileName: docx.fileName,
      sourceContent: SAMPLE_MD,
    });
    const aXlsx = await registerArtifact({
      userId: USER,
      buffer: xlsx.buffer,
      format: "xlsx",
      title: "品質確認_売上",
      fileName: xlsx.fileName,
      sourceContent: SAMPLE_MD,
    });
    const aPdf = await registerArtifact({
      userId: USER,
      buffer: pdf.buffer,
      format: "pdf",
      title: "品質確認_報告書",
      fileName: pdf.fileName,
      sourceContent: SAMPLE_MD,
    });

    for (const id of [aDocx.id, aXlsx.id, aPdf.id]) {
      const stored = await getStoredDeliverableForUser(id, USER);
      expect(stored?.buffer.byteLength).toBeGreaterThan(0);
      expect(stored?.mimeType).toBeTruthy();
    }

    const listed = await listUnifiedArtifacts({ userId: USER });
    expect(listed.total).toBeGreaterThanOrEqual(3);

    const preview = await buildUnifiedPreview({
      artifactId: aDocx.id,
      userId: USER,
    });
    expect(preview.downloadUrl).toContain(aDocx.id);
    expect(preview.ok).toBe(true);

    const rev = await createArtifactRevision({
      sourceArtifactId: aDocx.id,
      userId: USER,
      buffer: await (
        await new DocxDeliverableGenerator().generate(
          SAMPLE_MD + "\n\n改訂版",
          "品質確認_議事録",
        )
      ).buffer,
      changeReason: "品質ゲート改訂",
      idempotencyKey: "qa-rev-1",
    });
    expect(rev.ok).toBe(true);
    expect(rev.artifact?.id).not.toBe(aDocx.id);
    expect(await getStoredDeliverableForUser(aDocx.id, USER)).not.toBeNull();

    const toPdf = await convertArtifact({
      sourceArtifactId: aDocx.id,
      targetFormat: "pdf",
      userId: USER,
      options: { idempotencyKey: "qa-docx-pdf" },
    });
    expect(toPdf.ok).toBe(true);
    expect(toPdf.artifact?.format).toBe("pdf");

    const detail = await getArtifactDetail({ id: aDocx.id, userId: USER });
    expect(detail?.conversions.length).toBeGreaterThanOrEqual(1);
  });

  it("generates openable PowerPoint and converts to PDF", async () => {
    const pptx = await createPptxFromAssignment({
      assignment:
        "営業説明資料を作って。製品概要、価格、導入メリット、次のアクションを含めて。",
    });
    expect(pptx.ok).toBe(true);
    expect(pptx.buffer?.byteLength).toBeGreaterThan(1000);
    expect(pptx.buffer!.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(validateArtifactBytes("pptx", pptx.buffer!).ok).toBe(true);

    const artifact = await registerArtifact({
      userId: USER,
      buffer: pptx.buffer!,
      format: "pptx",
      title: "品質確認_営業資料",
      fileName: pptx.fileName,
      sourceContent: "営業説明",
    });
    const preview = await buildUnifiedPreview({
      artifactId: artifact.id,
      userId: USER,
    });
    expect(preview.ok).toBe(true);

    const converted = await convertArtifact({
      sourceArtifactId: artifact.id,
      targetFormat: "pdf",
      userId: USER,
      options: { idempotencyKey: "qa-pptx-pdf" },
    });
    expect(converted.ok).toBe(true);
    expect(converted.artifact?.format).toBe("pdf");
  });
});
