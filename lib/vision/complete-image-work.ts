import "server-only";

import { generateDeliverables } from "@/lib/deliverables/engine";
import { recordWordMetric } from "@/lib/deliverables/word-metrics";
import type { Deliverable } from "@/lib/deliverables/types";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import {
  repairVisionWordSeed,
  validateVisionWordSeed,
} from "@/lib/vision/adapters/structure-to-markdown";
import {
  formatsFromVisionBatch,
  titleFromVisionBatch,
  wordTemplateFromVisionBatch,
} from "@/lib/vision/formats-from-vision";
import {
  recordPhase2Failure,
  recordPhase2Kpi,
} from "@/lib/vision/phase2-kpis";
import type { VisionBatchResult } from "@/lib/vision/types";

export type VisionWorkCompletion = {
  ok: boolean;
  seed: string;
  formats: string[];
  title: string;
  deliverables: Deliverable[];
  failures: Array<{ format: string; reasons: string[] }>;
  downloadable: boolean;
  /** Secretary-safe progress only — never technical errors. */
  userProgressLabel: string;
  attempts: number;
  regenerated: boolean;
};

const MAX_PIPELINE_ATTEMPTS = 3;
const CONTINUING = "処理を続けています";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableFailure(reasons: string[]): boolean {
  const joined = reasons.join(" ").toLowerCase();
  return (
    /timeout|storage|persist|verify|convert|network|econnreset|429|503|temporarily|packer|ooxml/.test(
      joined,
    ) || reasons.length > 0
  );
}

/**
 * Image → structured seed → quality gate → Word (with silent retries).
 * User-facing status stays「処理を続けています」until Done.
 */
export async function completeImageWorkToDeliverables(input: {
  userId: string;
  assignment: string;
  batch: VisionBatchResult;
  requestOrigin?: string;
  jobId?: string | null;
}): Promise<VisionWorkCompletion> {
  const started = Date.now();
  recordPhase2Kpi("attempts");
  recordWordMetric("request");

  let seed = visionBatchToDeliverableContent(input.batch);
  let regenerated = false;
  const formats = formatsFromVisionBatch(input.batch, input.assignment);
  const title = titleFromVisionBatch(input.batch);
  const templateId = wordTemplateFromVisionBatch(input.batch, input.assignment);

  const structureCheck = validateVisionWordSeed(seed);
  if (structureCheck.ok) {
    recordPhase2Kpi("ocr_structure_hit");
  } else {
    recordPhase2Kpi("ocr_structure_miss");
    seed = repairVisionWordSeed(seed, input.batch);
    regenerated = true;
    recordPhase2Kpi("seed_repair");
    recordPhase2Kpi("regenerate");
  }

  if (!seed.trim()) {
    recordPhase2Failure("vision_seed_empty");
    recordWordMetric("failure", 1, { stage: "seed", message: "empty" });
    return {
      ok: false,
      seed,
      formats,
      title,
      deliverables: [],
      failures: [{ format: "all", reasons: ["vision_seed_empty"] }],
      downloadable: false,
      userProgressLabel: CONTINUING,
      attempts: 1,
      regenerated,
    };
  }

  // Prefer Word quality path for Phase2 when assignment implies document work.
  const effectiveFormats =
    formats.includes("docx") || /Word|ワード|docx|資料|レポート|文書/i.test(input.assignment)
      ? (formats.includes("docx") ? formats : (["docx", ...formats] as typeof formats))
      : formats;

  let lastFailures: Array<{ format: string; reasons: string[] }> = [];
  let deliverables: Deliverable[] = [];
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_PIPELINE_ATTEMPTS; attempt += 1) {
    attempts = attempt;
    if (attempt > 1) {
      recordPhase2Kpi("retry");
      recordWordMetric("retry");
      await sleep(250 * attempt);
      // Strengthen seed once before final attempt.
      if (attempt === MAX_PIPELINE_ATTEMPTS) {
        seed = repairVisionWordSeed(seed, input.batch);
        regenerated = true;
        recordPhase2Kpi("regenerate");
      }
    }

    try {
      const generated = await generateDeliverables(
        {
          assignment: input.assignment || title,
          finalDeliverable: seed,
          title,
          formats: effectiveFormats,
        },
        input.requestOrigin ?? "https://atlasapp.jp",
        {
          userId: input.userId,
          jobId: input.jobId ?? `vision_${input.batch.id}_a${attempt}`,
          suppressWordReadyNotification: true,
          // Deterministic + repair regenerator — no technical errors to users.
          contentAlreadyApproved: false,
          templateId,
          regenerateContent: async () => {
            recordPhase2Kpi("regenerate");
            seed = repairVisionWordSeed(seed, input.batch);
            regenerated = true;
            return seed;
          },
        },
      );

      deliverables = generated.deliverables.filter((d) => {
        if (!d.downloadUrl) return false;
        if (typeof d.sizeBytes === "number" && d.sizeBytes <= 0) return false;
        return true;
      });
      lastFailures = generated.failures;

      const hasDocx = deliverables.some((d) => d.format === "docx");
      const ok =
        deliverables.length > 0 &&
        (effectiveFormats.includes("docx") ? hasDocx : true);

      if (ok) {
        recordPhase2Kpi("success");
        recordWordMetric("success");
        recordPhase2Kpi("duration_ms", Date.now() - started);
        return {
          ok: true,
          seed,
          formats: effectiveFormats,
          title,
          deliverables,
          failures: lastFailures,
          downloadable: deliverables.some((d) =>
            Boolean(d.downloadUrl?.includes(`/api/deliverables/${d.id}`)),
          ),
          userProgressLabel: CONTINUING,
          attempts,
          regenerated,
        };
      }

      const reasons = lastFailures.flatMap((f) => f.reasons);
      if (!isRetryableFailure(reasons) && attempt >= 2) break;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      lastFailures = [{ format: "docx", reasons: [message] }];
      if (attempt >= MAX_PIPELINE_ATTEMPTS) {
        recordPhase2Failure("pipeline_exception", message);
        break;
      }
    }
  }

  recordPhase2Failure(
    "image_to_word_failed",
    lastFailures.map((f) => f.reasons.join(",")).join(";") || "unknown",
  );
  recordWordMetric("failure", 1, {
    stage: "vision_word",
    message: "exhausted_retries",
  });
  recordPhase2Kpi("duration_ms", Date.now() - started);

  return {
    ok: false,
    seed,
    formats: effectiveFormats,
    title,
    deliverables,
    failures: lastFailures,
    downloadable: false,
    userProgressLabel: CONTINUING,
    attempts,
    regenerated,
  };
}
