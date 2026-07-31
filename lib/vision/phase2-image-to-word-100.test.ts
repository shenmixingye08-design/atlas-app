/**
 * Phase2: 100 synthetic image→Word quality runs (no live OpenAI).
 * Measures seed structure + docx binary success rate.
 */

import { describe, expect, it } from "vitest";

import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import {
  repairVisionWordSeed,
  validateVisionWordSeed,
} from "@/lib/vision/adapters/structure-to-markdown";
import { wordTemplateFromVisionBatch } from "@/lib/vision/formats-from-vision";
import {
  getPhase2KpiSnapshot,
  recordPhase2Failure,
  recordPhase2Kpi,
  resetPhase2KpisForTests,
} from "@/lib/vision/phase2-kpis";
import type {
  VisionBatchResult,
  VisionDetectedType,
  VisionDocumentBlock,
} from "@/lib/vision/types";

const RUNS = 100;

const TYPES: VisionDetectedType[] = [
  "contract",
  "sales_material",
  "business_document",
  "chart",
  "handwritten_note",
  "screenshot",
  "general_photo",
  "table",
  "invoice",
  "business_card",
];

function structureFor(type: VisionDetectedType, i: number): VisionDocumentBlock[] {
  const title = `${type} 資料 ${i + 1}`;
  const base: VisionDocumentBlock[] = [
    { type: "title", text: title },
    { type: "heading", level: 2, text: "概要" },
    {
      type: "paragraph",
      text: `本資料は画像 ${i + 1} の内容を整理したものです。見出し・段落・表を分け、業務で使える文書にしています。数値や固有名詞は原資料に基づきます。`,
    },
    { type: "heading", level: 2, text: "要点" },
    {
      type: "bullet",
      items: [
        "構造を保持して文書化する",
        "表と箇条書きを自然に配置する",
        `ケース番号 ${i + 1} を識別できる`,
      ],
    },
    { type: "heading", level: 2, text: "手順" },
    {
      type: "numbered",
      items: ["内容を確認する", "必要な箇所を修正する", "関係者へ共有する"],
    },
  ];
  if (type === "table" || type === "invoice" || type === "chart" || i % 3 === 0) {
    base.push({
      type: "heading",
      level: 2,
      text: "一覧",
    });
    base.push({
      type: "table",
      headers: ["項目", "値", "備考"],
      rows: [
        ["A", String(1000 + i), "確認済"],
        ["B", String(2000 + i), "要確認"],
        ["C", String(3000 + i), ""],
      ],
    });
  }
  if (i % 7 === 0) {
    base.push({ type: "page_break" });
    base.push({
      type: "heading",
      level: 2,
      text: "補足",
    });
    base.push({
      type: "paragraph",
      text: "ページを分けた補足です。余白と見出し階層が自然であることを確認します。",
    });
  }
  return base;
}

function makeBatch(i: number): VisionBatchResult {
  const type = TYPES[i % TYPES.length]!;
  const now = new Date().toISOString();
  return {
    id: `phase2_batch_${i}`,
    images: [
      {
        id: `phase2_img_${i}`,
        attachmentId: `att_phase2_${i}`,
        detectedType: type,
        confidence: 0.82 + (i % 10) * 0.01,
        summary: `${type} の画像です。仕事用の文書に整えます。`,
        extractedText: `抽出テキスト ${i}: 見出しと本文と表を含みます。`,
        language: "ja",
        fields: {
          title: `${type} 資料 ${i + 1}`,
          keyMessage: "画像から自然な文書へ",
        },
        tables:
          type === "table"
            ? [
                {
                  headers: ["列1", "列2"],
                  rows: [
                    ["x", String(i)],
                    ["y", String(i + 1)],
                  ],
                },
              ]
            : [],
        documentStructure: structureFor(type, i),
        visualElements: ["見出し", "本文", "表"],
        layout: {
          hierarchy: "title>h2>body",
          sections: ["概要", "要点", "手順"],
          readability: "good",
        },
        styleSignals: {
          tone: "formal",
          headingStyle: "numbered-sections",
          structure: "report",
        },
        warnings: i % 19 === 0 ? ["一部の数値が不鮮明"] : [],
        missingFields: [],
        recommendedActions: ["内容を確認する", "必要なら修正する"],
        artifactSuggestions: ["chart_report_docx"],
        model: "fixture",
        detailLevel: "high",
        createdAt: now,
      },
    ],
    combinedSummary: `${type} 画像 ${i + 1} を文書化します。`,
    commonFields: { detectedType: type },
    differences: [],
    mergedTables: [],
    warnings: [],
    recommendedArtifactType: "chart_report_docx",
    status: "analyzed",
    model: "fixture",
    detailLevel: "high",
    createdAt: now,
  };
}

type FailureRow = {
  index: number;
  type: string;
  cause: string;
  improvement: string;
};

describe("Phase2 image→Word 100-run quality", () => {
  it(
    "reaches ≥99% docx success with structured seeds",
    async () => {
      resetPhase2KpisForTests();
      const failures: FailureRow[] = [];
      const generator = new DocxDeliverableGenerator();
      const durations: number[] = [];

      for (let i = 0; i < RUNS; i += 1) {
        const batch = makeBatch(i);
        const started = Date.now();
        recordPhase2Kpi("attempts");

        let seed = visionBatchToDeliverableContent(batch);
        const structure = validateVisionWordSeed(seed);
        if (structure.ok) {
          recordPhase2Kpi("ocr_structure_hit");
        } else {
          recordPhase2Kpi("ocr_structure_miss");
          seed = repairVisionWordSeed(seed, batch);
          recordPhase2Kpi("seed_repair");
        }

        // Inject 1 intentionally weak case to exercise repair (still must pass).
        if (i === 13) {
          seed = repairVisionWordSeed("# 弱い\n短い", batch);
          recordPhase2Kpi("regenerate");
        }

        try {
          const file = await generator.generate(seed, `phase2-${i}`, {
            assignment: "この画像から仕事用のWord資料を作って",
            title: batch.images[0]?.fields?.title
              ? String(batch.images[0].fields.title)
              : undefined,
            templateId: wordTemplateFromVisionBatch(batch, "Word資料を作って"),
          });
          const buf = file.buffer;
          const hasPk = buf[0] === 0x50 && buf[1] === 0x4b;
          const largeEnough = buf.byteLength >= 1_500;
          const head = buf.subarray(0, 64).toString("utf8");
          const leakedJson =
            head.includes('"type":') ||
            head.trimStart().startsWith("{") ||
            head.includes("<!DOCTYPE");
          if (!hasPk || !largeEnough || leakedJson) {
            const cause = !hasPk
              ? "missing_pk"
              : !largeEnough
                ? "too_small"
                : "payload_leak";
            recordPhase2Failure(cause, `index_${i}`);
            failures.push({
              index: i,
              type: batch.images[0]!.detectedType,
              cause,
              improvement: "Packer出力とseed構造の再検証",
            });
          } else if (!validateVisionWordSeed(seed).ok) {
            recordPhase2Failure("weak_seed", `index_${i}`);
            failures.push({
              index: i,
              type: batch.images[0]!.detectedType,
              cause: "weak_seed",
              improvement: "documentStructure必須化とrepair強化",
            });
          } else {
            recordPhase2Kpi("success");
          }
        } catch (error) {
          const cause = error instanceof Error ? error.message : "exception";
          recordPhase2Failure(cause, `index_${i}`);
          failures.push({
            index: i,
            type: batch.images[0]!.detectedType,
            cause,
            improvement: "seed修復とテンプレート選択の強化",
          });
        }

        durations.push(Date.now() - started);
        recordPhase2Kpi("duration_ms", durations[durations.length - 1]!);
      }

      const snapshot = getPhase2KpiSnapshot();
      const successRate = snapshot.successRate;
      const avgMs =
        durations.reduce((a, b) => a + b, 0) / Math.max(durations.length, 1);

      // Persist failure ledger for Phase2 review (console for CI logs).
      if (failures.length > 0) {
        console.error(
          "[phase2-100] failures",
          JSON.stringify(failures, null, 2),
        );
      }
      console.info(
        "[phase2-100] kpi",
        JSON.stringify(
          {
            runs: RUNS,
            successRate,
            avgMs: Math.round(avgMs),
            structureHitRate: snapshot.structureHitRate,
            regenerateRate: snapshot.regenerateRate,
            errorRate: snapshot.errorRate,
            failureCount: failures.length,
          },
          null,
          2,
        ),
      );

      expect(successRate).toBeGreaterThanOrEqual(0.99);
      expect(failures.length).toBeLessThanOrEqual(1);
      expect(avgMs).toBeLessThan(15_000);
    },
    180_000,
  );
});
