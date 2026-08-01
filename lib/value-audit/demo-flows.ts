import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { registerArtifact } from "@/lib/artifact-platform";
import { convertArtifact } from "@/lib/artifact-platform";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";

export type DemoFlowResult = {
  id: string;
  title: string;
  ok: boolean;
  environment: "local" | "production";
  durationMs: number;
  manualSteps: number;
  requestId: string;
  jobId: string | null;
  artifactIds: string[];
  outputs: string[];
  error: string | null;
  note: string;
};

export const DEFAULT_VALUE_DEMO_OUT =
  process.env.VALUE_AUDIT_OUT?.trim() ||
  "/opt/cursor/artifacts/value-audit-phase5";

/**
 * Three value demos using REAL generators (not dummy buffers).
 * Production HTTP path is separate and must not be marked ok without secrets.
 */
export async function runLocalValueDemos(userId = "va_demo_user"): Promise<{
  flows: DemoFlowResult[];
  productionAttempted: boolean;
  productionOk: boolean;
}> {
  const flows: DemoFlowResult[] = [];

  // Demo A: 売上テキスト → Excel
  {
    const started = Date.now();
    const requestId = `va_req_excel_${randomUUID().slice(0, 8)}`;
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    try {
      const gen = new XlsxDeliverableGenerator();
      const built = await gen.generate(
        [
          "# 売上管理表",
          "",
          "| 商品 | 数量 | 単価 | 金額 |",
          "| --- | ---: | ---: | ---: |",
          "| Aサービス | 3 | 10000 | 30000 |",
          "| Bサービス | 2 | 15000 | 30000 |",
          "| 合計 |  |  | 60000 |",
        ].join("\n"),
        "売上管理表",
        { assignment: "今月の売上管理表をExcelで作って" }
      );
      const art = await registerArtifact({
        userId,
        buffer: built.buffer,
        format: "xlsx",
        title: "売上管理表",
        requestId,
        jobId,
        sourceContent: "va demo sales excel",
      });
      const stored = await getStoredDeliverableForUser(art.id, userId);
      flows.push({
        id: "demo_sales_excel",
        title: "売上データからExcel集計",
        ok: Boolean(stored?.buffer?.byteLength && stored.buffer.byteLength > 100),
        environment: "local",
        durationMs: Date.now() - started,
        manualSteps: 1,
        requestId,
        jobId,
        artifactIds: [art.id],
        outputs: ["xlsx"],
        error: null,
        note: "ローカル実生成。本番HTTP未実行",
      });
    } catch (e) {
      flows.push({
        id: "demo_sales_excel",
        title: "売上データからExcel集計",
        ok: false,
        environment: "local",
        durationMs: Date.now() - started,
        manualSteps: 1,
        requestId,
        jobId,
        artifactIds: [],
        outputs: [],
        error: e instanceof Error ? e.message : String(e),
        note: "failed",
      });
    }
  }

  // Demo B: 報告書 Word → PDF
  {
    const started = Date.now();
    const requestId = `va_req_pdf_${randomUUID().slice(0, 8)}`;
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    try {
      const docx = await new DocxDeliverableGenerator().generate(
        "# 施工報告書\n\n## 概要\n本日の作業を報告します。\n\n## 結果\n完了\n",
        "施工報告書"
      );
      const word = await registerArtifact({
        userId,
        buffer: docx.buffer,
        format: "docx",
        title: "施工報告書",
        requestId: `${requestId}_docx`,
        jobId,
      });
      const conv = await convertArtifact({
        sourceArtifactId: word.id,
        targetFormat: "pdf",
        userId,
        options: { idempotencyKey: `${requestId}_to_pdf`, requestId },
      });
      const pdfId = conv.ok && conv.artifact ? conv.artifact.id : null;
      flows.push({
        id: "demo_report_pdf",
        title: "Word報告書から提出用PDF",
        ok: Boolean(conv.ok && pdfId),
        environment: "local",
        durationMs: Date.now() - started,
        manualSteps: 2,
        requestId,
        jobId,
        artifactIds: [word.id, ...(pdfId ? [pdfId] : [])],
        outputs: ["docx", "pdf"],
        error: conv.ok
          ? null
          : conv.errors[0]?.message ?? "convert_failed",
        note: "ローカル変換。Dropbox保存は本番未検証のためデモ範囲外",
      });
    } catch (e) {
      flows.push({
        id: "demo_report_pdf",
        title: "Word報告書から提出用PDF",
        ok: false,
        environment: "local",
        durationMs: Date.now() - started,
        manualSteps: 2,
        requestId,
        jobId,
        artifactIds: [],
        outputs: [],
        error: e instanceof Error ? e.message : String(e),
        note: "failed",
      });
    }
  }

  // Demo C: 営業資料 PowerPoint
  {
    const started = Date.now();
    const requestId = `va_req_pptx_${randomUUID().slice(0, 8)}`;
    const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    try {
      const pptx = await new PptxDeliverableGenerator().generate(
        [
          "# 新規提案",
          "",
          "## 課題",
          "- 手作業が多い",
          "- 提出形式がばらつく",
          "",
          "## 提案",
          "- 実ファイルまで自動作成",
          "- 履歴で再提出",
          "",
          "## 次のアクション",
          "- サンプル依頼",
          "- Lightプラン検討",
        ].join("\n"),
        "営業説明資料"
      );
      const art = await registerArtifact({
        userId,
        buffer: pptx.buffer,
        format: "pptx",
        title: "営業説明資料",
        requestId,
        jobId,
      });
      const stored = await getStoredDeliverableForUser(art.id, userId);
      flows.push({
        id: "demo_pitch_pptx",
        title: "営業資料をPowerPoint化",
        ok: Boolean(stored?.buffer?.byteLength && stored.buffer.byteLength > 100),
        environment: "local",
        durationMs: Date.now() - started,
        manualSteps: 1,
        requestId,
        jobId,
        artifactIds: [art.id],
        outputs: ["pptx"],
        error: null,
        note: "ローカル実生成。本番HTTP未実行",
      });
    } catch (e) {
      flows.push({
        id: "demo_pitch_pptx",
        title: "営業資料をPowerPoint化",
        ok: false,
        environment: "local",
        durationMs: Date.now() - started,
        manualSteps: 1,
        requestId,
        jobId,
        artifactIds: [],
        outputs: [],
        error: e instanceof Error ? e.message : String(e),
        note: "failed",
      });
    }
  }

  const productionConfigured = Boolean(
    process.env.PRODUCTION_E2E_BASE_URL?.trim() &&
      process.env.CLERK_SECRET_KEY?.trim()
  );

  return {
    flows,
    productionAttempted: false,
    productionOk: productionConfigured ? false : false,
  };
}

export function writeDemoEvidence(
  outRoot: string,
  payload: Awaited<ReturnType<typeof runLocalValueDemos>>
): string {
  mkdirSync(outRoot, { recursive: true });
  const path = join(outRoot, "demos.json");
  writeFileSync(
    path,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        productionE2eConfigured: Boolean(
          process.env.PRODUCTION_E2E_BASE_URL?.trim()
        ),
        ...payload,
      },
      null,
      2
    )
  );
  return path;
}
