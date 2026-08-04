import { describe, expect, it } from "vitest";

import {
  assignmentImpliesImageWork,
  evaluateMissingAttachmentIdsGate,
  evaluateVisionBatchGate,
  inferRequiredVisionFields,
  stripVisionPoisonText,
} from "@/lib/vision/gate";
import type { VisionBatchResult } from "@/lib/vision/types";

describe("vision gate", () => {
  it("strips legacy poison notes and filename-only attachment lines", () => {
    const text = stripVisionPoisonText(
      [
        "氏名と住所を抽出して",
        "【添付注意】ファイルの中身はまだ自動取得できません。ファイル名を参考に作業してください。",
        "【添付】",
        "- 4830.jpg（photo / 120 KB）",
        "「4830.jpg」はレシートです。家計簿へ登録してください。",
      ].join("\n"),
    );
    expect(text).toContain("氏名と住所を抽出して");
    expect(text).not.toContain("自動取得できません");
    expect(text).not.toContain("4830.jpg");
    expect(text).toContain("添付画像");
  });

  it("infers required fields from extract requests", () => {
    expect(inferRequiredVisionFields("氏名と住所を抽出してください")).toEqual([
      "name",
      "address",
    ]);
  });

  it("detects image work from household / receipt prompts", () => {
    expect(assignmentImpliesImageWork("家計簿Excelにして")).toBe(true);
    expect(assignmentImpliesImageWork("週次報告を書いて")).toBe(false);
  });

  it("blocks when image work is implied but attachmentIds are missing", () => {
    const gate = evaluateMissingAttachmentIdsGate({
      assignment: "「4830.jpg」はレシートです。家計簿へ登録してください。",
      attachmentIds: [],
    });
    expect(gate?.status).toBe("needs_image_retry");
    expect(gate?.userCode).toBe("missing_attachment_ids");
  });

  it("blocks artifact when analysis succeeded but required fields are null", () => {
    const batch: VisionBatchResult = {
      id: "b1",
      images: [
        {
          id: "v1",
          attachmentId: "img1",
          detectedType: "business_document",
          confidence: 0.9,
          summary: "書類画像",
          extractedText: "（本文なし）",
          language: "ja",
          fields: { personName: null, address: null },
          tables: [],
          visualElements: [],
          layout: null,
          styleSignals: null,
          warnings: [],
          missingFields: ["personName", "address"],
          recommendedActions: [],
          artifactSuggestions: [],
          model: "mock",
          detailLevel: "high",
          createdAt: new Date().toISOString(),
        },
      ],
      combinedSummary: "書類",
      commonFields: { detectedType: "business_document" },
      differences: [],
      mergedTables: [],
      warnings: [],
      recommendedArtifactType: null,
      status: "analyzed",
      model: "mock",
      detailLevel: "high",
      createdAt: new Date().toISOString(),
    };

    const gate = evaluateVisionBatchGate({
      batch,
      userText: "氏名と住所を抽出してください",
    });
    expect(gate.analysisSuccess).toBe(true);
    expect(gate.status).toBe("needs_input");
    expect(gate.message).toContain("画像内に該当情報を確認できませんでした");
  });

  it("blocks household artifact when receipt fields are all empty", () => {
    const batch: VisionBatchResult = {
      id: "b3",
      images: [
        {
          id: "v1",
          attachmentId: "img1",
          detectedType: "receipt",
          confidence: 0.5,
          summary: "不鮮明",
          extractedText: null,
          language: "ja",
          fields: { storeName: null, date: null, total: null, items: [] },
          tables: [],
          visualElements: [],
          layout: null,
          styleSignals: null,
          warnings: [],
          missingFields: ["storeName", "date", "total"],
          recommendedActions: [],
          artifactSuggestions: ["household_excel"],
          model: "mock",
          detailLevel: "high",
          createdAt: new Date().toISOString(),
        },
      ],
      combinedSummary: "不鮮明",
      commonFields: { detectedType: "receipt" },
      differences: [],
      mergedTables: [],
      warnings: [],
      recommendedArtifactType: "household_excel",
      status: "analyzed",
      model: "mock",
      detailLevel: "high",
      createdAt: new Date().toISOString(),
    };
    const gate = evaluateVisionBatchGate({
      batch,
      userText: "家計簿にして",
    });
    expect(gate.status).toBe("needs_input");
    expect(gate.analysisSuccess).toBe(true);
  });

  it("treats empty image batch as analysis failure (not missing fields)", () => {
    const batch: VisionBatchResult = {
      id: "b2",
      images: [],
      combinedSummary: "",
      commonFields: {},
      differences: [],
      mergedTables: [],
      warnings: ["failed"],
      recommendedArtifactType: null,
      status: "failed",
      model: "mock",
      detailLevel: "high",
      createdAt: new Date().toISOString(),
    };
    const gate = evaluateVisionBatchGate({
      batch,
      userText: "氏名と住所を抽出してください",
    });
    expect(gate.analysisSuccess).toBe(false);
    expect(gate.status).toBe("vision_failed");
    expect(gate.message).toContain("画像の内容を解析できませんでした");
  });
});
