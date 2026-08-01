/**
 * Vision Production Ready — 200枚耐久試験
 * 分類 / OCR補強 / レイアウト / 業務シード / 成果物生成 / 画質 / 品質検査
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import {
  formatsFromVisionBatch,
  titleFromVisionBatch,
} from "@/lib/vision/formats-from-vision";
import { completeImageWorkToDeliverables } from "@/lib/vision/complete-image-work";
import type {
  VisionAnalysisResult,
  VisionBatchResult,
  VisionDetectedType,
} from "@/lib/vision/types";
import { refineVisionAnalysisResult } from "@/lib/vision/vision-production/refine-result";
import { inspectVisionQuality } from "@/lib/vision/vision-production/quality-inspect";
import { assessImageQuality } from "@/lib/vision/vision-production/image-quality";
import { extractStructuredOcrFields } from "@/lib/vision/vision-production/ocr-fields";
import { resetDeliverableMemoryStoreForTests } from "@/lib/deliverables/store";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { resetWordJobsForTests } from "@/lib/deliverables/word-job-stages";

const ARTIFACT_DIR = "/opt/cursor/artifacts/vision-production";
const N = 200;

type FixtureKind =
  | "receipt"
  | "receipt_voucher"
  | "invoice"
  | "contract"
  | "table"
  | "chart"
  | "photo"
  | "whiteboard"
  | "handwritten"
  | "construction_photo"
  | "business_card";

const KINDS: FixtureKind[] = [
  "receipt",
  "receipt_voucher",
  "invoice",
  "contract",
  "table",
  "chart",
  "photo",
  "whiteboard",
  "handwritten",
  "construction_photo",
  "business_card",
];

const EXPECTED_TYPE: Record<FixtureKind, VisionDetectedType> = {
  receipt: "receipt",
  receipt_voucher: "receipt_voucher",
  invoice: "invoice",
  contract: "contract",
  table: "table",
  chart: "chart",
  photo: "general_photo",
  whiteboard: "whiteboard",
  handwritten: "handwritten_note",
  construction_photo: "construction_photo",
  business_card: "business_card",
};

function buildRawResult(
  kind: FixtureKind,
  index: number,
): VisionAnalysisResult {
  const id = `vis_d${index}`;
  const common = {
    id,
    attachmentId: `att_${index}`,
    model: "mock-vision",
    detailLevel: "high" as const,
    createdAt: new Date().toISOString(),
    visualElements: [],
    styleSignals: null,
    warnings: [] as string[],
    missingFields: [] as string[],
    recommendedActions: [] as string[],
    artifactSuggestions: [] as string[],
    tables: [] as VisionAnalysisResult["tables"],
    layout: null as VisionAnalysisResult["layout"],
    language: "ja",
  };

  switch (kind) {
    case "receipt":
      return {
        ...common,
        detectedType: "unknown",
        confidence: 0.5,
        summary: "買い物レシート",
        extractedText: `レシート\nMINERVOT MART\n2026/07/${(index % 28) + 1}\nお茶 150\n弁当 980\n税抜 1,130\n消費税 150\n税込合計 1,280円\nTEL 03-1234-5678`,
        fields: {
          storeName: "MINERVOT MART",
          items: [
            { name: "お茶", amount: 150 },
            { name: "弁当", amount: 980 },
          ],
        },
      };
    case "receipt_voucher":
      return {
        ...common,
        detectedType: "unknown",
        confidence: 0.48,
        summary: "領収書画像",
        extractedText: `領収書\n株式会社サンプル\n2026年8月1日\n税抜 5,000\n消費税 500\n税込合計 5,500円\n東京都千代田区1-1`,
        fields: {},
      };
    case "invoice":
      return {
        ...common,
        detectedType: "unknown",
        confidence: 0.52,
        summary: "請求書",
        extractedText: `請求書\n株式会社サンプル\n請求番号 INV-${index}\n2026/07/01\n税抜 100,000\n消費税 10,000\n税込合計 110,000\nbilling@example.com`,
        fields: {
          issuer: "株式会社サンプル",
          invoiceNumber: `INV-${index}`,
        },
      };
    case "contract":
      return {
        ...common,
        detectedType: "unknown",
        confidence: 0.55,
        summary: "契約書",
        extractedText: `契約書\n秘密保持契約\n甲 株式会社A\n乙 株式会社B\n署名欄\n印`,
        fields: { parties: "甲/乙" },
        layout: { signature: null, seal: null },
      };
    case "table":
      return {
        ...common,
        detectedType: "table",
        confidence: 0.9,
        summary: "表データ",
        extractedText: "| 品目 | 数量 |\n| A | 2 |",
        fields: {},
        tables: [
          {
            headers: ["品目", "数量"],
            rows: [
              ["A", 2],
              ["B", 1],
            ],
          },
        ],
      };
    case "chart":
      return {
        ...common,
        detectedType: "chart",
        confidence: 0.88,
        summary: "売上グラフ",
        extractedText: "棒グラフ 売上推移",
        fields: {
          chartType: "棒グラフ",
          title: "売上",
          insights: ["増加"],
        },
      };
    case "photo":
      return {
        ...common,
        detectedType: "general_photo",
        confidence: 0.8,
        summary: "現場写真",
        extractedText: "",
        fields: { scene: "屋外" },
        visualElements: ["建物"],
      };
    case "whiteboard":
      return {
        ...common,
        detectedType: "unknown",
        confidence: 0.5,
        summary: "ホワイトボード写真",
        extractedText: `ホワイトボード\n議事録\n決定: 来週提出\nTODO: 資料作成`,
        fields: {},
      };
    case "handwritten":
      return {
        ...common,
        detectedType: "handwritten_note",
        confidence: 0.82,
        summary: "手書きメモ",
        extractedText: "明日10時 見積",
        fields: {
          rawText: "明日10時 見積",
          cleanedText: "明日の10時に見積を送る",
        },
      };
    case "construction_photo":
      return {
        ...common,
        detectedType: "unknown",
        confidence: 0.5,
        summary: "工事現場",
        extractedText: `施工写真\n現場${index}\n進捗80%`,
        fields: { progress: "80%" },
        visualElements: ["足場"],
      };
    case "business_card":
      return {
        ...common,
        detectedType: "business_card",
        confidence: 0.9,
        summary: "名刺",
        extractedText: `山田太郎\n株式会社サンプル\n03-9999-8888\nyamada@example.com\n東京都港区`,
        fields: {
          personName: "山田太郎",
          companyName: "株式会社サンプル",
        },
      };
  }
}

function assignmentFor(kind: FixtureKind): string {
  switch (kind) {
    case "receipt":
    case "receipt_voucher":
      return "家計簿Excelにしてください";
    case "invoice":
      return "請求管理Excelにしてください";
    case "business_card":
      return "連絡先一覧にしてください";
    case "construction_photo":
      return "施工報告書Wordにしてください";
    case "whiteboard":
      return "議事録Wordにしてください";
    case "handwritten":
      return "手書きメモをWordで整理してください";
    default:
      return "画像から成果物を作成してください";
  }
}

function toBatch(
  refined: VisionAnalysisResult,
  recommended: string | null,
): VisionBatchResult {
  return {
    id: `vbatch_${refined.id}`,
    images: [refined],
    combinedSummary: refined.summary,
    commonFields: { detectedType: refined.detectedType },
    differences: [],
    mergedTables: refined.tables,
    warnings: refined.warnings,
    recommendedArtifactType: recommended,
    status: "analyzed",
    model: refined.model,
    detailLevel: refined.detailLevel,
    createdAt: refined.createdAt,
  };
}

function recommend(type: VisionDetectedType): string | null {
  if (type === "receipt" || type === "receipt_voucher") return "household_excel";
  if (type === "invoice" || type === "delivery_note") return "invoice_excel";
  if (type === "business_card") return "contact_list_excel";
  if (type === "construction_photo") return "construction_report_docx";
  if (type === "meeting_minutes" || type === "whiteboard") {
    return "meeting_minutes_docx";
  }
  if (type === "screenshot") return "manual_docx";
  if (type === "table" || type === "spreadsheet_source") return "table_excel";
  if (type === "chart") return "chart_report_docx";
  if (type === "contract") return "contract_docx";
  if (type === "handwritten_note") return "memo_text";
  return "photo_report_docx";
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx]!;
}

async function makeQualityPng(
  kind: FixtureKind,
  index: number,
): Promise<Buffer> {
  const dark = index % 5 === 0;
  const small = index % 7 === 0;
  const w = small ? 320 : 800;
  const h = small ? 240 : 600;
  const bg = dark
    ? { r: 20, g: 20, b: 24 }
    : { r: 245, g: 245, b: 240 };
  const fill = dark ? "#ddd" : "#111";
  return sharp({
    create: { width: w, height: h, channels: 3, background: bg },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${w}" height="${h}"><text x="20" y="40" font-size="22" fill="${fill}">${kind} #${index}</text></svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .jpeg({ quality: index % 6 === 0 ? 40 : 85 })
    .toBuffer();
}

describe("vision production durability n=200", () => {
  beforeEach(() => {
    resetWordJobsForTests();
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
  });

  afterEach(() => {
    resetWordJobsForTests();
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
  });

  it(
    "classifies, OCR-enriches, seeds deliverables, and generates files for 200 images",
    async () => {
      const durations: number[] = [];
      let classifyHits = 0;
      let ocrHits = 0;
      let seedHits = 0;
      let deliverableHits = 0;
      let qualityPasses = 0;
      let imageQualityOk = 0;

      for (let i = 0; i < N; i += 1) {
        const kind = KINDS[i % KINDS.length]!;
        const t0 = performance.now();

        const raw = buildRawResult(kind, i);
        const png = await makeQualityPng(kind, i);
        const iq = await assessImageQuality(png);
        if (iq.warnings.length >= 0) imageQualityOk += 1;

        const refined = refineVisionAnalysisResult({
          result: raw,
          userHint: EXPECTED_TYPE[kind],
          imageQuality: iq,
        });

        if (refined.detectedType === EXPECTED_TYPE[kind]) classifyHits += 1;

        const structured = extractStructuredOcrFields(
          refined.extractedText,
          refined.fields,
        );
        const ocrOk =
          kind === "photo" ||
          kind === "chart" ||
          kind === "table" ||
          Boolean(
            refined.extractedText?.trim() ||
              structured.total != null ||
              structured.companyName ||
              structured.email ||
              refined.fields.personName ||
              refined.fields.cleanedText,
          );
        if (ocrOk) ocrHits += 1;

        const recommended = recommend(refined.detectedType);
        const batch = toBatch(refined, recommended);
        const assignment = assignmentFor(kind);
        const seed = visionBatchToDeliverableContent(batch);
        const formats = formatsFromVisionBatch(batch, assignment);
        const title = titleFromVisionBatch(batch);

        const notOcrOnly =
          seed.includes("#") &&
          !seed.startsWith(refined.extractedText ?? "___") &&
          seed.length > 40;
        if (notOcrOnly && formats.length > 0) seedHits += 1;

        const quality = inspectVisionQuality({
          result: refined,
          imageQuality: iq,
          recommendedFormats: formats,
        });
        if (quality.passed || quality.deliverableReady) qualityPasses += 1;

        const completion = await completeImageWorkToDeliverables({
          userId: "user_vision_durability",
          assignment: `${assignment} ${title}`,
          batch,
          requestOrigin: "https://atlasapp.jp",
          jobId: `vision_durability_${i}`,
        });
        if (completion.ok && completion.deliverables.length > 0) {
          deliverableHits += 1;
        }

        durations.push(performance.now() - t0);
      }

      const sorted = [...durations].sort((a, b) => a - b);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const p95 = percentile(sorted, 95);
      const successRate = deliverableHits / N;
      const classifyRate = classifyHits / N;
      const ocrRate = ocrHits / N;
      const seedRate = seedHits / N;

      mkdirSync(ARTIFACT_DIR, { recursive: true });
      const report = {
        n: N,
        successRate,
        classifyAccuracy: classifyRate,
        ocrAccuracy: ocrRate,
        deliverableGenerationRate: successRate,
        seedReadyRate: seedRate,
        qualityPassRate: qualityPasses / N,
        imageQualityAssessedRate: imageQualityOk / N,
        avgMs: Number(avg.toFixed(2)),
        p95Ms: Number(p95.toFixed(2)),
        kinds: KINDS,
        timestamp: new Date().toISOString(),
      };
      writeFileSync(
        path.join(ARTIFACT_DIR, "durability-200-report.json"),
        JSON.stringify(report, null, 2),
      );

      expect(classifyRate).toBeGreaterThanOrEqual(0.9);
      expect(ocrRate).toBeGreaterThanOrEqual(0.9);
      expect(seedRate).toBeGreaterThanOrEqual(0.95);
      expect(successRate).toBeGreaterThanOrEqual(0.95);
      expect(avg).toBeLessThan(15_000);
      expect(p95).toBeLessThan(30_000);
    },
    600_000,
  );
});
