/**
 * Image → understand → deliverable E2E (mock LLM, real PNG bytes).
 * Covers all secretary image types required for MINERVOT.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { uploadUserImage, uploadUserImages } from "@/lib/attachments/image-upload";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { resetDeliverableMemoryStoreForTests } from "@/lib/deliverables/store";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { resetWordJobsForTests } from "@/lib/deliverables/word-job-stages";
import { prepareAssignmentWithVision } from "@/lib/vision/prepare-assignment";
import { analyzeUserImageBatch } from "@/lib/vision/analyze-batch";
import { openAiVisionProvider } from "@/lib/vision/openai-vision-provider";
import { VisionError } from "@/lib/vision/types";
import type { Deliverable } from "@/lib/deliverables/types";

async function makeLabeledPng(label: string): Promise<Buffer> {
  const base = await sharp({
    create: {
      width: 720,
      height: 480,
      channels: 3,
      background: { r: 248, g: 248, b: 244 },
    },
  })
    .png()
    .toBuffer();

  return sharp(base)
    .composite([
      {
        input: Buffer.from(
          `<svg width="720" height="480">
            <rect x="16" y="16" width="688" height="448" fill="#fff" stroke="#333" stroke-width="2"/>
            <text x="40" y="80" font-size="28" fill="#111">${label}</text>
            <text x="40" y="140" font-size="20" fill="#333">MINERVOT vision e2e fixture</text>
          </svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
}

type Case = {
  name: string;
  label: string;
  assignment: string;
  expectType: string;
  expectFormats: Array<"docx" | "xlsx" | "pdf">;
  multi?: boolean;
};

const CASES: Case[] = [
  {
    name: "レシート",
    label: "RECEIPT 1280 YEN",
    assignment: "このレシートを家計簿Excelにしてください",
    expectType: "receipt",
    expectFormats: ["xlsx"],
  },
  {
    name: "請求書",
    label: "INVOICE INV-001",
    assignment: "この請求書を整理してExcelにしてください",
    expectType: "invoice",
    expectFormats: ["xlsx"],
  },
  {
    name: "契約書",
    label: "CONTRACT NDA",
    assignment: "この契約書を要約してWordにしてください",
    expectType: "contract",
    expectFormats: ["docx"],
  },
  {
    name: "表・Excel",
    label: "TABLE A B C",
    assignment: "この表画像をExcelにしてください",
    expectType: "table",
    expectFormats: ["xlsx"],
  },
  {
    name: "グラフ",
    label: "CHART SALES",
    assignment: "このグラフを分析してレポートをWordで作成してください",
    expectType: "chart",
    expectFormats: ["docx"],
  },
  {
    name: "手書きメモ",
    label: "HANDWRITTEN MEMO",
    assignment: "この手書きメモを文章にしてWordで整理してください",
    expectType: "handwritten_note",
    expectFormats: ["docx"],
  },
  {
    name: "名刺",
    label: "BUSINESS CARD",
    assignment: "この名刺の連絡先を整理してください",
    expectType: "business_card",
    expectFormats: ["docx"],
  },
  {
    name: "スクリーンショット",
    label: "SCREENSHOT SETTINGS",
    assignment: "このスクリーンショットの内容を要約してWordにしてください",
    expectType: "screenshot",
    expectFormats: ["docx"],
  },
  {
    name: "写真",
    label: "SITE PHOTO",
    assignment: "この写真の状況を報告書にしてください",
    expectType: "general_photo",
    expectFormats: ["docx"],
  },
];

describe("vision secretary E2E — image understand → deliverable", () => {
  const prevMock = process.env.ATLAS_MOCK_LLM;
  const prevStorage = process.env.ATLAS_ATTACHMENT_STORAGE;
  const prevVercel = process.env.VERCEL_ENV;
  let dataRoot: string;
  let prevCwd: string;

  beforeEach(() => {
    process.env.ATLAS_MOCK_LLM = "true";
    process.env.ATLAS_ATTACHMENT_STORAGE = "local";
    delete process.env.VERCEL_ENV;
    dataRoot = mkdtempSync(path.join(tmpdir(), "atlas-vision-e2e-"));
    prevCwd = process.cwd();
    process.chdir(dataRoot);
    resetWordJobsForTests();
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
  });

  afterEach(() => {
    process.chdir(prevCwd);
    if (prevMock === undefined) delete process.env.ATLAS_MOCK_LLM;
    else process.env.ATLAS_MOCK_LLM = prevMock;
    if (prevStorage === undefined) delete process.env.ATLAS_ATTACHMENT_STORAGE;
    else process.env.ATLAS_ATTACHMENT_STORAGE = prevStorage;
    if (prevVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercel;
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it.each(CASES)(
    "$name: upload → AI multimodal → understand → downloadable files",
    async (c) => {
      const png = await makeLabeledPng(c.label);
      const uploaded = await uploadUserImage({
        userId: "user_vision_e2e",
        fileName: `${c.expectType}.png`,
        mimeType: "image/png",
        buffer: png,
        preferReadableText: true,
      });
      expect(uploaded.attachment.id).toBeTruthy();
      expect(uploaded.attachment.processedBytes).toBeGreaterThan(100);

      const prepared = await prepareAssignmentWithVision({
        userId: "user_vision_e2e",
        assignment: c.assignment,
        metadata: {
          attachmentIds: [uploaded.attachment.id],
          jobId: `job_${c.expectType}`,
          forceVisionRefresh: true,
        },
      });

      expect(prepared.skipped).toBe(false);
      expect(prepared.gate).toBeUndefined();
      expect(prepared.batch?.images[0]?.detectedType).toBe(c.expectType);
      expect(prepared.assignment).toContain("画像理解結果");
      expect(prepared.metadata.visionAnalysisSuccess).toBe(true);
      expect(typeof prepared.metadata.visionDeliverableSeed).toBe("string");
      expect(String(prepared.metadata.visionDeliverableSeed).length).toBeGreaterThan(
        40,
      );

      // Not OCR-only: structured fields / understanding present.
      const image = prepared.batch!.images[0]!;
      expect(image.summary.trim().length).toBeGreaterThan(5);
      expect(image.confidence).toBeGreaterThan(0.5);
      if (c.expectType !== "general_photo") {
        expect(
          Object.keys(image.fields).length + image.tables.length,
        ).toBeGreaterThan(0);
      }

      const files = (prepared.metadata.visionGeneratedDeliverables ??
        []) as Deliverable[];
      expect(prepared.metadata.visionDeliverablesOk).toBe(true);
      expect(prepared.metadata.visionDeliverablesDownloadable).toBe(true);
      expect(files.length).toBeGreaterThan(0);

      for (const fmt of c.expectFormats) {
        const hit = files.find((f) => f.format === fmt);
        expect(hit, `expected format ${fmt}`).toBeTruthy();
        expect(hit!.sizeBytes).toBeGreaterThan(0);
        expect(hit!.downloadUrl).toContain(`/api/deliverables/${hit!.id}`);

        const stored = await getStoredDeliverableForUser(
          hit!.id,
          "user_vision_e2e",
        );
        expect(stored).toBeTruthy();
        expect(stored!.buffer.byteLength).toBeGreaterThan(0);
        if (fmt === "docx" || fmt === "xlsx") {
          expect(stored!.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
        }
      }
    },
    60_000,
  );

  it("multiple images in one request are all sent and merged", async () => {
    const a = await makeLabeledPng("RECEIPT PAGE1");
    const b = await makeLabeledPng("RECEIPT PAGE2");
    const uploaded = await uploadUserImages({
      userId: "user_vision_multi",
      files: [
        {
          fileName: "r1.png",
          mimeType: "image/png",
          buffer: a,
        },
        {
          fileName: "r2.png",
          mimeType: "image/png",
          buffer: b,
        },
      ],
      preferReadableText: true,
    });
    expect(uploaded.results).toHaveLength(2);
    const attachmentIds = uploaded.results.map((u) => u.attachment.id);

    const batch = await analyzeUserImageBatch({
      userId: "user_vision_multi",
      attachmentIds,
      userText: "複数枚のレシートを家計簿Excelにしてください",
    });

    expect(batch.images).toHaveLength(2);
    expect(batch.images.every((img) => img.detectedType === "receipt")).toBe(
      true,
    );
    expect(batch.combinedSummary).toContain("画像1");
    expect(batch.combinedSummary).toContain("画像2");
    expect(batch.recommendedArtifactType).toBe("household_excel");

    const prepared = await prepareAssignmentWithVision({
      userId: "user_vision_multi",
      assignment: "複数枚のレシートを家計簿Excelにしてください",
      metadata: {
        attachmentIds,
        visionReuse: false,
      },
    });
    const files = (prepared.metadata.visionGeneratedDeliverables ??
      []) as Deliverable[];
    expect(files.some((f) => f.format === "xlsx")).toBe(true);
  }, 60_000);

  it("rejects non-data-url images (must send real image bytes)", async () => {
    await expect(
      openAiVisionProvider.analyzeImage({
        userId: "user_vision_e2e",
        attachmentId: "img_reject",
        imageUrl: "https://example.com/receipt.png",
        userText: "レシート",
        hintType: "receipt",
        detail: "high",
        pageIndex: 0,
        pageCount: 1,
      }),
    ).rejects.toBeInstanceOf(VisionError);
  });

  it("proves multimodal provider receives data:image base64 payload", async () => {
    const png = await makeLabeledPng("RECEIPT PROOF");
    const uploaded = await uploadUserImage({
      userId: "user_vision_proof",
      fileName: "proof.png",
      mimeType: "image/png",
      buffer: png,
      preferReadableText: true,
    });

    let capturedUrl: string | null = null;
    const spyProvider = {
      id: "spy",
      async analyzeImage(input: {
        userId: string;
        attachmentId: string;
        imageUrl: string;
        userText: string;
        hintType: import("@/lib/vision/types").VisionDetectedType;
        detail: import("@/lib/vision/types").VisionDetailLevel;
        pageIndex: number;
        pageCount: number;
        jobId?: string | null;
        diagnosticId?: string | null;
      }) {
        capturedUrl =
          typeof input.imageUrl === "string"
            ? input.imageUrl
            : JSON.stringify(input.imageUrl);
        return openAiVisionProvider.analyzeImage(input);
      },
    };

    await analyzeUserImageBatch({
      userId: "user_vision_proof",
      attachmentIds: [uploaded.attachment.id],
      userText: "レシートを家計簿Excelにしてください",
      provider: spyProvider as never,
      forceRefresh: true,
    });

    expect(capturedUrl).toMatch(/^data:image\/(png|jpeg);base64,/i);
    expect((capturedUrl ?? "").length).toBeGreaterThan(100);
  }, 30_000);
});
