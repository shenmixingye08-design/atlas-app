import { createHash, randomUUID } from "crypto";

import { registerArtifact } from "@/lib/artifact-platform";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { createPptxFromAssignment } from "@/lib/pptx-secretary/service";
import { classifyOpsFailure } from "@/lib/ops-durability/classify";
import type { OpsStorageResult } from "@/lib/ops-durability/types";

const FORMATS = [
  "docx",
  "xlsx",
  "pdf",
  "pptx",
  "csv",
  "png",
  "preview",
  "thumbnail",
  "revision",
] as const;

async function makeBuffer(
  format: (typeof FORMATS)[number],
  i: number
): Promise<{ buffer: Buffer; registerFormat: string; fileName: string }> {
  const token = `STOR-${i}-${1000 + i * 7}`;
  if (format === "docx" || format === "preview" || format === "revision") {
    const f = await new DocxDeliverableGenerator().generate(
      `# Storage ${token}\n\n本文\n`,
      `stor_${i}`
    );
    return { buffer: f.buffer, registerFormat: "docx", fileName: f.fileName };
  }
  if (format === "xlsx") {
    const f = await new XlsxDeliverableGenerator().generate(
      `# ${token}\n\n| A | B |\n| --- | ---: |\n| ${token} | ${i} |\n`,
      `stor_${i}`,
      { assignment: "売上表をExcelで" }
    );
    return { buffer: f.buffer, registerFormat: "xlsx", fileName: f.fileName };
  }
  if (format === "pdf" || format === "thumbnail") {
    const f = await new PdfDeliverableGenerator().generate(
      `# ${token}\n\nPDF\n`,
      `stor_${i}`
    );
    return { buffer: f.buffer, registerFormat: "pdf", fileName: f.fileName };
  }
  if (format === "pptx") {
    const r = await createPptxFromAssignment({
      assignment: `${token}の説明資料`,
      contentMarkdown: `# ${token}\n\n- a\n- b\n`,
    });
    if (!r.ok || !r.buffer) throw new Error(r.errors[0]?.message ?? "pptx");
    return {
      buffer: r.buffer,
      registerFormat: "pptx",
      fileName: r.fileName ?? `stor_${i}.pptx`,
    };
  }
  if (format === "csv") {
    const csv = `name,qty\n${token},${i}\n`;
    return {
      buffer: Buffer.from(csv, "utf8"),
      registerFormat: "csv",
      fileName: `stor_${i}.csv`,
    };
  }
  // png
  const sharp = (await import("sharp")).default;
  const buffer = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: (i * 3) % 200, g: 40, b: 80 },
    },
  })
    .png()
    .toBuffer();
  return { buffer, registerFormat: "png", fileName: `stor_${i}.png` };
}

/** 1000 unique storage files across formats. */
export async function runStorageDurability(input: {
  userId: string;
  otherUserId: string;
  count?: number;
}): Promise<OpsStorageResult[]> {
  const count = input.count ?? 1000;
  const results: OpsStorageResult[] = [];

  for (let i = 1; i <= count; i++) {
    const format = FORMATS[(i - 1) % FORMATS.length]!;
    const caseId = `ops_stor_${String(i).padStart(4, "0")}`;
    const requestId = `opsstor_${caseId}_${randomUUID().slice(0, 8)}`;
    const started = Date.now();
    let okUpload = false;
    let okDownload = false;
    let zeroByte = false;
    let mimeOk = true;
    let extOk = true;
    let crossUserLeak = false;
    let orphan = false;
    let fileSize = 0;
    let sha256: string | null = null;
    let artifactId: string | null = null;
    let failureClass: OpsStorageResult["failureClass"] = null;

    try {
      const made = await makeBuffer(format, i);
      zeroByte = made.buffer.byteLength === 0;
      if (zeroByte) throw new Error("zero_byte_rejected");
      fileSize = made.buffer.byteLength;
      sha256 = createHash("sha256").update(made.buffer).digest("hex");
      extOk = made.fileName.toLowerCase().endsWith(`.${made.registerFormat}`);

      const art = await registerArtifact({
        userId: input.userId,
        buffer: made.buffer,
        format: made.registerFormat as never,
        title: caseId,
        fileName: made.fileName,
        sourceContent: caseId,
        requestId,
        createdFrom: "ops-durability-storage",
      });
      artifactId = art.id;
      okUpload = (art.fileSize ?? 0) > 0;
      mimeOk = Boolean(art.mimeType);

      const stored = await getStoredDeliverableForUser(art.id, input.userId);
      okDownload = Boolean(stored?.buffer && stored.buffer.byteLength > 0);

      const leak = await getStoredDeliverableForUser(
        art.id,
        input.otherUserId
      );
      crossUserLeak = Boolean(leak?.buffer?.byteLength);

      // Orphan: registered but missing bytes
      orphan = okUpload && !okDownload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failureClass = classifyOpsFailure({
        stage: "storage",
        message,
      });
    }

    results.push({
      caseId,
      format,
      okUpload,
      okDownload,
      okSignedUrl: null, // deliverable path uses auth download, not signed URL
      zeroByte,
      mimeOk,
      extOk,
      crossUserLeak,
      orphan,
      fileSize,
      sha256,
      artifactId,
      requestId,
      failureClass,
      durationMs: Date.now() - started,
    });
  }

  return results;
}
