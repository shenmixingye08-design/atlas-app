import "server-only";

import { generateDeliverables } from "@/lib/deliverables/engine";
import { createDeliverableFile } from "@/lib/deliverables/generators/shared";
import {
  saveDeliverableFileDurable,
  toDeliverableMetadata,
} from "@/lib/deliverables/store";
import type { Deliverable } from "@/lib/deliverables/types";
import { createExcelFromVisionTables } from "@/lib/excel-secretary";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import {
  formatsFromVisionBatch,
  titleFromVisionBatch,
} from "@/lib/vision/formats-from-vision";
import type { VisionBatchResult, VisionTable } from "@/lib/vision/types";

export type VisionWorkCompletion = {
  ok: boolean;
  seed: string;
  formats: string[];
  title: string;
  deliverables: Deliverable[];
  failures: Array<{ format: string; reasons: string[] }>;
  downloadable: boolean;
};

function collectVisionTables(batch: VisionBatchResult): VisionTable[] {
  if (batch.mergedTables?.length) return batch.mergedTables;
  return batch.images.flatMap((image) => image.tables ?? []);
}

/**
 * Turn vision understanding into real downloadable files (Word/PDF/Excel).
 * Uses the structured seed (not OCR-only). Does not modify Planner core.
 * When structured tables exist, Excel Secretary builds cell-aware xlsx first.
 */
export async function completeImageWorkToDeliverables(input: {
  userId: string;
  assignment: string;
  batch: VisionBatchResult;
  requestOrigin?: string;
  jobId?: string | null;
}): Promise<VisionWorkCompletion> {
  const seed = visionBatchToDeliverableContent(input.batch);
  const formats = formatsFromVisionBatch(input.batch, input.assignment);
  const title = titleFromVisionBatch(input.batch);
  const visionTables = collectVisionTables(input.batch);

  if (!seed.trim() && visionTables.length === 0) {
    return {
      ok: false,
      seed,
      formats,
      title,
      deliverables: [],
      failures: [{ format: "all", reasons: ["vision_seed_empty"] }],
      downloadable: false,
    };
  }

  const deliverables: Deliverable[] = [];
  const failures: Array<{ format: string; reasons: string[] }> = [];

  // Prefer structure-preserving Excel when vision extracted tables.
  if (formats.includes("xlsx") && visionTables.length > 0) {
    const excel = await createExcelFromVisionTables({
      title,
      kind: "from_image",
      tables: visionTables.map((table, index) => ({
        name: `表${index + 1}`,
        headers: table.headers,
        rows: table.rows,
      })),
    });
    if (excel.ok && excel.buffer) {
      const file = createDeliverableFile("xlsx", title || "画像Excel", excel.buffer, false);
      const stored = await saveDeliverableFileDurable(file, input.userId, {
        sourceContent: seed,
        baseFileName: title || "画像Excel",
        metadata: {
          purpose: "excel_secretary_vision",
        },
      });
      deliverables.push(toDeliverableMetadata(stored));
    } else {
      failures.push({
        format: "xlsx",
        reasons: excel.errors.map((e) => `${e.stage}:${e.code}`),
      });
    }
  }

  const remainingFormats = deliverables.some((d) => d.format === "xlsx")
    ? formats.filter((f) => f !== "xlsx")
    : formats;

  if (remainingFormats.length > 0 && seed.trim()) {
    const generated = await generateDeliverables(
      {
        assignment: input.assignment || title,
        finalDeliverable: seed,
        title,
        formats: remainingFormats,
      },
      input.requestOrigin ?? "https://atlasapp.jp",
      {
        userId: input.userId,
        jobId: input.jobId ?? `vision_${input.batch.id}`,
        suppressWordReadyNotification: true,
        contentAlreadyApproved: true,
      },
    );
    for (const d of generated.deliverables) {
      if (!d.downloadUrl) continue;
      if (typeof d.sizeBytes === "number" && d.sizeBytes <= 0) continue;
      deliverables.push(d);
    }
    failures.push(...generated.failures);
  } else if (!seed.trim() && deliverables.length === 0) {
    failures.push({ format: "all", reasons: ["vision_seed_empty"] });
  }

  return {
    ok: deliverables.length > 0,
    seed,
    formats,
    title,
    deliverables,
    failures,
    downloadable: deliverables.some((d) =>
      Boolean(d.downloadUrl?.includes(`/api/deliverables/${d.id}`)),
    ),
  };
}
