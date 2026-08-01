import { randomUUID } from "crypto";

import {
  convertArtifact,
  registerArtifact,
  validateArtifactBytes,
} from "@/lib/artifact-platform";
import { runConversionEngine } from "@/lib/artifact-platform/convert-engines";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { createPptxFromAssignment } from "@/lib/pptx-secretary/service";
import { classifyArtifactFailure } from "@/lib/artifact-durability/classify";
import type { ConversionCaseResult } from "@/lib/artifact-durability/types";

type Pair = {
  id: string;
  source: "docx" | "xlsx" | "pdf" | "pptx" | "csv" | "png";
  target: "docx" | "xlsx" | "pdf" | "pptx";
};

const PAIRS: Pair[] = [
  { id: "word_to_pdf", source: "docx", target: "pdf" },
  { id: "excel_to_pdf", source: "xlsx", target: "pdf" },
  { id: "pptx_to_pdf", source: "pptx", target: "pdf" },
  { id: "pdf_to_word", source: "pdf", target: "docx" },
  { id: "pdf_to_excel", source: "pdf", target: "xlsx" },
  { id: "word_to_pptx", source: "docx", target: "pptx" },
  { id: "excel_to_pptx", source: "xlsx", target: "pptx" },
  { id: "csv_to_excel", source: "csv", target: "xlsx" },
  { id: "image_to_pdf", source: "png", target: "pdf" },
];

async function makeSourceBuffer(
  source: Pair["source"],
  i: number
): Promise<{ buffer: Buffer; content: string; title: string }> {
  const title = `変換元_${source}_${i}`;
  const content = `# ${title}\n\n固有本文 CONV-${source}-${i}-${100 + i * 3}\n\n| A | B |\n| --- | --- |\n| ${i} | ${i * 10} |\n`;
  if (source === "docx") {
    const f = await new DocxDeliverableGenerator().generate(content, title);
    return { buffer: f.buffer, content, title };
  }
  if (source === "xlsx") {
    const f = await new XlsxDeliverableGenerator().generate(content, title, {
      assignment: "変換用の売上表をExcelで",
    });
    return { buffer: f.buffer, content, title };
  }
  if (source === "pdf") {
    const f = await new PdfDeliverableGenerator().generate(content, title);
    return { buffer: f.buffer, content, title };
  }
  if (source === "pptx") {
    const r = await createPptxFromAssignment({
      assignment: `${title}の説明資料を作って`,
      contentMarkdown: content,
    });
    if (!r.ok || !r.buffer) {
      throw new Error(r.errors[0]?.message ?? "pptx_failed");
    }
    return { buffer: r.buffer, content, title };
  }
  if (source === "csv") {
    const csv = `品目,数量,金額\n商品${i},${10 + i},${1000 + i * 11}\n商品B${i},${20 + i},${2000 + i * 7}\n`;
    return { buffer: Buffer.from(csv, "utf8"), content: csv, title };
  }
  throw new Error(`makeSourceBuffer does not support ${source}`);
}

async function makePngUnique(i: number): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({
    create: {
      width: 320,
      height: 200,
      channels: 3,
      background: { r: 40 + (i % 100), g: 80, b: 120 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="320" height="200"><text x="20" y="100" font-size="22" fill="#fff">IMG-${i}</text></svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
}

/**
 * Run conversion matrix: each pair × count (default 20) = 180 cases.
 */
export async function runConversionSuite(input: {
  userId: string;
  countPerPair?: number;
}): Promise<ConversionCaseResult[]> {
  const count = input.countPerPair ?? 20;
  const results: ConversionCaseResult[] = [];

  for (const pair of PAIRS) {
    for (let i = 1; i <= count; i++) {
      const caseId = `conv_${pair.id}_${String(i).padStart(2, "0")}`;
      const requestId = `adconv_${caseId}_${randomUUID().slice(0, 8)}`;
      const started = Date.now();
      const log: string[] = [`${caseId} ${pair.source}->${pair.target}`];
      let sourceArtifactId: string | null = null;
      let targetArtifactId: string | null = null;
      let rootArtifactId: string | null = null;
      let overwrittenSource = false;
      let zeroByte = false;
      let mimeOk = false;
      let openable = false;
      let ok = false;
      let failureReason: string | null = null;

      try {
        const src =
          pair.source === "png"
            ? {
                buffer: await makePngUnique(i),
                content: `IMG-${i}`,
                title: `画像_${i}`,
              }
            : await makeSourceBuffer(pair.source, i);

        // Register source when it's an artifact format
        if (pair.source !== "csv" && pair.source !== "png") {
          const registered = await registerArtifact({
            userId: input.userId,
            buffer: src.buffer,
            format: pair.source,
            title: src.title,
            sourceContent: src.content,
            requestId,
            createdFrom: "artifact-durability-convert",
          });
          sourceArtifactId = registered.id;
          rootArtifactId = registered.rootArtifactId ?? registered.id;

          const converted = await convertArtifact({
            sourceArtifactId: registered.id,
            targetFormat: pair.target,
            userId: input.userId,
            options: {
              title: `${src.title}_to_${pair.target}`,
              requestId,
              revisionReason: `convert ${pair.source}->${pair.target}`,
            },
          });
          ok = Boolean(converted.ok && converted.artifact);
          targetArtifactId = converted.artifact?.id ?? null;
          overwrittenSource = targetArtifactId === sourceArtifactId;
          const size = converted.artifact?.fileSize ?? 0;
          zeroByte = size <= 0;
          openable = ok && !zeroByte;
          mimeOk = ok;
          log.push(
            `convertArtifact ok=${ok} target=${targetArtifactId} size=${size}`
          );
          if (overwrittenSource) {
            ok = false;
            failureReason = "source_overwritten";
          }
        } else {
          const engine = await runConversionEngine({
            sourceFormat: pair.source,
            targetFormat: pair.target,
            buffer:
              pair.source === "png" ? await makePngUnique(i) : src.buffer,
            title: src.title,
            sourceContent: src.content,
            fileName: `${src.title}.${pair.source}`,
          });
          zeroByte = engine.buffer.length <= 0;
          const validation = validateArtifactBytes(pair.target, engine.buffer);
          openable = validation.ok && !zeroByte;
          mimeOk = validation.ok;
          const registered = await registerArtifact({
            userId: input.userId,
            buffer: engine.buffer,
            format: pair.target,
            title: `${src.title}_to_${pair.target}`,
            sourceContent: engine.sourceContent,
            requestId,
            createdFrom: "artifact-durability-convert-engine",
          });
          targetArtifactId = registered.id;
          rootArtifactId = registered.id;
          ok = openable && !zeroByte;
          log.push(
            `engine ok=${ok} quality=${engine.quality} size=${engine.buffer.length}`
          );
        }
      } catch (error) {
        failureReason = error instanceof Error ? error.message : String(error);
        log.push(`ERROR ${failureReason}`);
        ok = false;
      }

      results.push({
        caseId,
        sourceFormat: pair.source,
        targetFormat: pair.target,
        ok,
        requestId,
        sourceArtifactId,
        targetArtifactId,
        rootArtifactId,
        overwrittenSource,
        zeroByte,
        mimeOk,
        openable,
        durationMs: Date.now() - started,
        failureClass: ok
          ? null
          : classifyArtifactFailure({
              stage: "convert",
              message: failureReason,
              zeroByte,
            }),
        failureReason,
        log,
      });
    }
  }

  return results;
}

export { PAIRS as CONVERSION_PAIRS };
