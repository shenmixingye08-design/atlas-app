import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { uploadUserImage } from "@/lib/attachments/image-upload";
import { analyzeUserImageBatch } from "@/lib/vision/analyze-batch";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import { generateDeliverables } from "@/lib/deliverables/engine";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";

async function png(label: string): Promise<Buffer> {
  return sharp({
    create: {
      width: 800,
      height: 500,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="800" height="500"><text x="40" y="80" font-size="32" fill="#111">${label}</text></svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
}

describe("vision sample artifact generation (mock)", () => {
  const prev = process.env.ATLAS_MOCK_LLM;
  let dataRoot: string;
  let prevCwd: string;

  beforeEach(() => {
    process.env.ATLAS_MOCK_LLM = "true";
    dataRoot = mkdtempSync(path.join(tmpdir(), "atlas-vision-samples-"));
    prevCwd = process.cwd();
    process.chdir(dataRoot);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    if (prev === undefined) delete process.env.ATLAS_MOCK_LLM;
    else process.env.ATLAS_MOCK_LLM = prev;
    rmSync(dataRoot, { recursive: true, force: true });
  });

  it("generates deliverable files from vision seeds", async () => {
    const outDir = path.join(
      prevCwd,
      "tmp/vision-samples",
    );
    mkdirSync(outDir, { recursive: true });
    const artifactDir = "/opt/cursor/artifacts/vision-samples";
    mkdirSync(artifactDir, { recursive: true });

    const cases = [
      { name: "receipt", text: "このレシートを家計簿Excelにして", label: "RECEIPT" },
      { name: "table", text: "この表をExcelにして", label: "TABLE" },
      { name: "sales", text: "この営業資料を改善して", label: "SALES" },
      { name: "memo", text: "手書きメモを文字にして", label: "MEMO" },
    ] as const;

    for (const sample of cases) {
      const uploaded = await uploadUserImage({
        userId: "sample_user",
        fileName: `${sample.name}.png`,
        mimeType: "image/png",
        buffer: await png(sample.label),
        preferReadableText: true,
      });
      const batch = await analyzeUserImageBatch({
        userId: "sample_user",
        attachmentIds: [uploaded.attachment.id],
        userText: sample.text,
      });
      expect(batch.images[0]?.detectedType).toBeTruthy();
      const seed = visionBatchToDeliverableContent(batch);
      writeFileSync(path.join(outDir, `${sample.name}.md`), seed, "utf8");
      writeFileSync(path.join(artifactDir, `${sample.name}.md`), seed, "utf8");

      const result = await generateDeliverables(
        {
          assignment: sample.text,
          finalDeliverable: seed,
          title: `vision-${sample.name}`,
          projectName: `vision-${sample.name}`,
        },
        "http://localhost",
        { userId: "sample_user" },
      );
      expect(result.deliverables.length).toBeGreaterThan(0);

      for (const file of result.deliverables) {
        const stored = getStoredDeliverableForUser(file.id, "sample_user");
        if (!stored?.buffer?.length) continue;
        const ext =
          file.format === "docx"
            ? "docx"
            : file.format === "xlsx"
              ? "xlsx"
              : file.format === "pdf"
                ? "pdf"
                : file.format;
        writeFileSync(path.join(outDir, `${sample.name}.${ext}`), stored.buffer);
        writeFileSync(path.join(artifactDir, `${sample.name}.${ext}`), stored.buffer);
      }
    }
  }, 60_000);
});
