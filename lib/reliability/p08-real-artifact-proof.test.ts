/**
 * P08 production-equivalent deliverable proof (NO ATLAS_MOCK_LLM).
 * Generates real Office bytes and verifies they open.
 * Vision requires OPENAI_API_KEY — fails closed if missing (not mocked).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { verifyGeneratedExportAsync } from "@/lib/deliverables/export-verify";
import { openAiVisionProvider } from "@/lib/vision/openai-vision-provider";

const OUT =
  process.env.P08_E2E_OUT_DIR ??
  "/opt/cursor/artifacts/p08-blocker-fixes/real-artifacts";

const BODY = `# P08実生成レポート

## 概要
MINERVOTが実ファイルとして成果物を生成できることを証明します。

## 本文
${"日本語の実データです。仮データや空ファイルではありません。売上は128万円、件数は42件でした。\n".repeat(30)}

## 表
| 項目 | 値 |
| --- | --- |
| Word | docx |
| Excel | xlsx |
| PDF | pdf |
| PowerPoint | pptx |
`;

function assertZipOpenable(filePath: string, format: string) {
  const listed = execFileSync("unzip", ["-l", filePath], {
    encoding: "utf8",
  });
  expect(listed.length).toBeGreaterThan(20);
  if (format === "docx" || format === "pptx" || format === "xlsx") {
    expect(listed).toMatch(/\[Content_Types\]\.xml|xl\/|ppt\/|word\//);
  }
  const fileOut = execFileSync("file", [filePath], { encoding: "utf8" });
  expect(fileOut.toLowerCase()).toMatch(/zip|microsoft|composite|ooxml|pdf/);
}

describe("P08 real artifact generation (no mock LLM)", () => {
  it(
    "generates openable Word / Excel / PDF / PowerPoint and optional vision",
    async () => {
      // Hard ban on mock success for this gate.
      expect(process.env.ATLAS_MOCK_LLM).not.toBe("true");
      mkdirSync(OUT, { recursive: true });

      const results: Record<string, unknown> = {
        measuredAt: new Date().toISOString(),
        mockLlm: process.env.ATLAS_MOCK_LLM ?? null,
        openaiKeyPresent: Boolean(process.env.OPENAI_API_KEY?.trim()),
      };

      const docx = await new DocxDeliverableGenerator().generate(BODY, "p08_word");
      const xlsx = await new XlsxDeliverableGenerator().generate(BODY, "p08_excel");
      const pdf = await new PdfDeliverableGenerator().generate(BODY, "p08_pdf");
      const pptx = await new PptxDeliverableGenerator().generate(
        BODY,
        "p08_pptx",
      );

      for (const [name, file] of [
        ["docx", docx],
        ["xlsx", xlsx],
        ["pdf", pdf],
        ["pptx", pptx],
      ] as const) {
        const verify = await verifyGeneratedExportAsync(file);
        expect(verify.ok, `${name}: ${verify.reasons.join(",")}`).toBe(true);
        expect(file.buffer.byteLength).toBeGreaterThan(500);
        const path = join(OUT, file.fileName);
        writeFileSync(path, file.buffer);
        if (name === "pdf") {
          const text = execFileSync("pdftotext", [path, "-"], {
            encoding: "utf8",
          });
          expect(text).toMatch(/日本語|P08|売上|MINERVOT|実データ/);
          const fileOut = execFileSync("file", [path], { encoding: "utf8" });
          expect(fileOut.toLowerCase()).toContain("pdf");
        } else {
          assertZipOpenable(path, name);
        }
        results[name] = {
          ok: true,
          fileName: file.fileName,
          mimeType: file.mimeType,
          bytes: file.buffer.byteLength,
          path,
        };
      }

      // Image analysis — real OpenAI only. No mock fallback.
      let vision: Record<string, unknown> = { attempted: false };
      if (process.env.OPENAI_API_KEY?.trim()) {
        const png = await sharp({
          create: {
            width: 640,
            height: 400,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
          },
        })
          .composite([
            {
              input: Buffer.from(
                `<svg width="640" height="400">
                  <text x="40" y="80" font-size="32" fill="#111">RECEIPT TOTAL 1280 YEN</text>
                  <text x="40" y="140" font-size="22" fill="#333">Store: MINERVOT MART</text>
                  <text x="40" y="190" font-size="22" fill="#333">Item: Coffee x2</text>
                </svg>`,
              ),
              top: 0,
              left: 0,
            },
          ])
          .jpeg()
          .toBuffer();

        const dataUrl = `data:image/jpeg;base64,${png.toString("base64")}`;
        const analyzed = await openAiVisionProvider.analyzeImage({
          userId: "p08_e2e_user",
          attachmentId: "p08_img_1",
          imageUrl: dataUrl,
          imageBytes: png,
          userText: "このレシートの合計金額を教えてください",
          hintType: "receipt",
          detail: "high",
          pageIndex: 0,
          pageCount: 1,
        });
        const summary = [
          analyzed.rawText,
          analyzed.result.summary,
          JSON.stringify(analyzed.result.fields ?? {}),
          analyzed.result.detectedType,
        ].join(" ");
        expect(summary.length).toBeGreaterThan(20);
        // Proof the model saw receipt content (not empty / not mock stub).
        expect(summary.toLowerCase()).toMatch(
          /1280|receipt|yen|合計|円|レシート|coffee|mart/i,
        );
        vision = {
          attempted: true,
          ok: true,
          model: analyzed.model,
          detectedType: analyzed.result.detectedType,
          summaryPreview: summary.slice(0, 400),
        };
      } else {
        vision = {
          attempted: false,
          ok: false,
          reason: "OPENAI_API_KEY unset — image analysis not proven (Blocker remains)",
        };
      }
      results.vision = vision;

      writeFileSync(join(OUT, "report.json"), JSON.stringify(results, null, 2));
      writeFileSync(
        join(OUT, "report.md"),
        `# P08 Real Artifact Proof\n\n\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n`,
      );

      expect(results.docx).toBeTruthy();
      expect(results.xlsx).toBeTruthy();
      expect(results.pdf).toBeTruthy();
      expect(results.pptx).toBeTruthy();

      // Vision is required for P08 gate — fail if key missing.
      expect(
        vision.ok,
        String((vision as { reason?: string }).reason ?? "vision failed"),
      ).toBe(true);
    },
    180_000,
  );
});
