import "server-only";

import { generateDeliverables } from "@/lib/deliverables/engine";
import type { Deliverable } from "@/lib/deliverables/types";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import {
  formatsFromVisionBatch,
  titleFromVisionBatch,
} from "@/lib/vision/formats-from-vision";
import type { VisionBatchResult } from "@/lib/vision/types";

export type VisionWorkCompletion = {
  ok: boolean;
  seed: string;
  formats: string[];
  title: string;
  deliverables: Deliverable[];
  failures: Array<{ format: string; reasons: string[] }>;
  downloadable: boolean;
};

/**
 * Turn vision understanding into real downloadable files (Word/PDF/Excel).
 * Uses the structured seed (not OCR-only). Does not modify Planner core.
 */
export async function completeImageWorkToDeliverables(input: {
  userId: string;
  assignment: string;
  batch: VisionBatchResult;
  requestOrigin?: string;
  jobId?: string | null;
}): Promise<VisionWorkCompletion> {
  const seed = visionBatchToDeliverableContent(input.batch, input.assignment);
  const formats = formatsFromVisionBatch(input.batch, input.assignment);
  const title = titleFromVisionBatch(input.batch);

  if (!seed.trim()) {
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

  const generated = await generateDeliverables(
    {
      assignment: input.assignment || title,
      finalDeliverable: seed,
      title,
      formats,
    },
    input.requestOrigin ?? "https://atlasapp.jp",
    {
      userId: input.userId,
      jobId: input.jobId ?? `vision_${input.batch.id}`,
      suppressWordReadyNotification: true,
      contentAlreadyApproved: true,
    },
  );

  const deliverables = generated.deliverables.filter((d) => {
    if (!d.downloadUrl) return false;
    if (typeof d.sizeBytes === "number" && d.sizeBytes <= 0) return false;
    return true;
  });
  if (
    process.env.ATLAS_DEBUG === "true" ||
    process.env.NEXT_PUBLIC_ATLAS_DEBUG === "true"
  ) {
    console.info(
      "[vision] artifact_generation_result",
      JSON.stringify({
        batchId: input.batch.id,
        formats,
        generatedCount: generated.deliverables.length,
        downloadableCount: deliverables.length,
        failures: generated.failures,
      }),
    );
  }

  return {
    ok: deliverables.length > 0,
    seed,
    formats,
    title,
    deliverables,
    failures: generated.failures,
    downloadable: deliverables.some((d) =>
      Boolean(d.downloadUrl?.includes(`/api/deliverables/${d.id}`)),
    ),
  };
}
