import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { uploadUserImage } from "@/lib/attachments/image-upload";
import { getImageAttachmentForUser } from "@/lib/attachments/store";
import { analyzeUserImageBatch } from "@/lib/vision/analyze-batch";
import { prepareAssignmentWithVision } from "@/lib/vision/prepare-assignment";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";

async function makePng(label: string): Promise<Buffer> {
  // Simple readable-ish PNG for preprocess pipeline.
  return sharp({
    create: {
      width: 640,
      height: 400,
      channels: 3,
      background: { r: 250, g: 250, b: 245 },
    },
  })
    .png()
    .toBuffer()
    .then(async (buffer) =>
      sharp(buffer)
        .composite([
          {
            input: Buffer.from(
              `<svg width="640" height="400"><text x="24" y="64" font-size="28" fill="#222">${label}</text></svg>`,
            ),
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toBuffer(),
    );
}

describe("vision analyze integration (mock LLM)", () => {
  const prevCwdData = process.env.ATLAS_MOCK_LLM;
  let dataRoot: string;
  let prevCwd: string;

  const prevStorage = process.env.ATLAS_ATTACHMENT_STORAGE;
  const prevVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    process.env.ATLAS_MOCK_LLM = "true";
    process.env.ATLAS_ATTACHMENT_STORAGE = "local";
    delete process.env.VERCEL_ENV;
    dataRoot = mkdtempSync(path.join(tmpdir(), "atlas-vision-"));
    prevCwd = process.cwd();
    // store uses process.cwd()/.data — chdir into temp workspace
    process.chdir(dataRoot);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    if (prevCwdData === undefined) delete process.env.ATLAS_MOCK_LLM;
    else process.env.ATLAS_MOCK_LLM = prevCwdData;
    if (prevStorage === undefined) delete process.env.ATLAS_ATTACHMENT_STORAGE;
    else process.env.ATLAS_ATTACHMENT_STORAGE = prevStorage;
    if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercelEnv;
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it("passes image through preprocess → OpenAI multimodal mock → structured result → excel seed", async () => {
    const png = await makePng("RECEIPT TOTAL 1280");
    const uploaded = await uploadUserImage({
      userId: "user_a",
      fileName: "receipt.png",
      mimeType: "image/png",
      buffer: png,
      preferReadableText: true,
    });

    const batch = await analyzeUserImageBatch({
      userId: "user_a",
      attachmentIds: [uploaded.attachment.id],
      userText: "このレシートを家計簿Excelにして",
    });

    expect(batch.images).toHaveLength(1);
    expect(batch.images[0]?.detectedType).toBe("receipt");
    expect(batch.recommendedArtifactType).toBe("household_excel");
    const seed = visionBatchToDeliverableContent(batch);
    expect(seed).toContain("家計簿");
    expect(seed).toContain("MINERVOT MART");
  });

  it("blocks other users from reading attachments", async () => {
    const png = await makePng("SECRET");
    const uploaded = await uploadUserImage({
      userId: "user_a",
      fileName: "secret.png",
      mimeType: "image/png",
      buffer: png,
    });
    expect(await getImageAttachmentForUser("user_b", uploaded.attachment.id)).toBeNull();
  });

  it("skips vision when no attachmentIds (text-only)", async () => {
    const prepared = await prepareAssignmentWithVision({
      userId: "user_a",
      assignment: "週次報告を書いて",
      metadata: {},
    });
    expect(prepared.skipped).toBe(true);
    expect(prepared.assignment).toBe("週次報告を書いて");
  });

  it("returns vision gate and does not enrich when required extract fields are absent", async () => {
    const png = await makePng("NO NAME ADDRESS");
    const uploaded = await uploadUserImage({
      userId: "user_a",
      fileName: "blank.png",
      mimeType: "image/png",
      buffer: png,
    });

    const prepared = await prepareAssignmentWithVision({
      userId: "user_a",
      assignment: "氏名と住所を抽出してください",
      metadata: { attachmentIds: [uploaded.attachment.id] },
    });

    expect(prepared.gate).toBeTruthy();
    expect(prepared.gate?.analysisSuccess).toBe(true);
    expect(prepared.gate?.status).toBe("needs_input");
    expect(prepared.assignment).not.toMatch(/自動取得できなかった|画像確認要/);
    // analysis succeeded; required fields absent in image → block artifact, not "vision failed"
    expect(prepared.metadata.visionStatus).toBe("needs_input");
  });

  it("returns config_missing gate on Preview without Supabase (no artifact path)", async () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const prepared = await prepareAssignmentWithVision({
      userId: "user_a",
      assignment: "この画像の会社名を抽出して",
      metadata: { attachmentIds: ["img_missing"] },
    });

    expect(prepared.gate).toBeTruthy();
    expect(prepared.gate?.status).toBe("config_missing");
    expect(prepared.gate?.analysisSuccess).toBe(false);
    expect(prepared.batch).toBeNull();
  });

  it("rejects unsupported image type", async () => {
    await expect(
      uploadUserImage({
        userId: "user_a",
        fileName: "note.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("hello"),
      }),
    ).rejects.toThrow(/対応形式/);
  });

  it("reuses analysis via content hash cache", async () => {
    const png = await makePng("CACHE ME");
    const first = await uploadUserImage({
      userId: "user_a",
      fileName: "a.png",
      mimeType: "image/png",
      buffer: png,
    });
    const second = await uploadUserImage({
      userId: "user_a",
      fileName: "b.png",
      mimeType: "image/png",
      buffer: png,
    });
    expect(second.attachment.id).toBe(first.attachment.id);

    const batch1 = await analyzeUserImageBatch({
      userId: "user_a",
      attachmentIds: [first.attachment.id],
      userText: "家計簿にして",
    });
    const batch2 = await analyzeUserImageBatch({
      userId: "user_a",
      attachmentIds: [first.attachment.id],
      userText: "家計簿にして",
    });
    expect(batch2.images[0]?.cached).toBe(true);
    expect(batch1.images[0]?.summary).toBe(batch2.images[0]?.summary);
  });
});
