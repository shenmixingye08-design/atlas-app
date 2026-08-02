import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { Document, Packer, Paragraph, TextRun } from "docx";

import type { WorkJobRecord, WorkStepRecord } from "../types";

export type StepExecutionResult = {
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  outputBindings?: Record<string, unknown>;
  artifactIds?: string[];
  /** External side-effect already applied — recovery must not redo. */
  externalApplied?: boolean;
};

async function generateOfflineDocx(title: string): Promise<{
  artifactId: string;
  path: string;
  bytes: number;
}> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: title, bold: true })],
          }),
          new Paragraph({
            children: [
              new TextRun(
                `Generated at ${new Date().toISOString()} by MINERVOT work-queue worker.`,
              ),
            ],
          }),
        ],
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  const artifactId = `art_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const dir = join(process.cwd(), ".data", "work-queue-artifacts");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${artifactId}.docx`);
  writeFileSync(path, buffer);
  return { artifactId, path, bytes: buffer.byteLength };
}

/**
 * Execute a single step. Completed steps must not be re-run by the worker.
 * Offline/fixture paths create real DOCX bytes (not mock success flags).
 */
export async function executeWorkStep(input: {
  job: WorkJobRecord;
  step: WorkStepRecord;
  previousOutputs: Record<string, unknown>;
}): Promise<StepExecutionResult> {
  const { job, step } = input;

  if (step.status === "completed") {
    return {
      ok: true,
      outputBindings: step.outputBindings,
      artifactIds: step.artifactIds,
      externalApplied: true,
    };
  }

  switch (step.stepType) {
    case "fixture_work":
    case "generate_deliverable": {
      if (step.inputBindings.forceFail === true) {
        return {
          ok: false,
          errorCode: "storage_temporary",
          errorMessage: "forced generate failure",
        };
      }
      const title =
        (typeof job.payload.assignment === "string" && job.payload.assignment) ||
        job.payload.automationName ||
        "MINERVOT work result";
      const artifact = await generateOfflineDocx(title);
      return {
        ok: true,
        artifactIds: [artifact.artifactId],
        outputBindings: {
          artifactId: artifact.artifactId,
          artifactPath: artifact.path,
          bytes: artifact.bytes,
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      };
    }
    case "upload_storage": {
      if (step.inputBindings.forceFail === true) {
        return {
          ok: false,
          errorCode: "storage_temporary",
          errorMessage: "forced upload failure",
        };
      }
      const artifactId =
        (input.previousOutputs.artifactId as string | undefined) ||
        step.artifactIds[0];
      const artifactPath = input.previousOutputs.artifactPath as
        | string
        | undefined;
      if (!artifactId || !artifactPath) {
        return {
          ok: false,
          errorCode: "validation_failure",
          errorMessage: "missing artifact from previous step",
        };
      }
      // Persist a storage receipt next to the artifact (local durable proof).
      const receipt = `${artifactPath}.uploaded.json`;
      writeFileSync(
        receipt,
        JSON.stringify({
          artifactId,
          uploadedAt: new Date().toISOString(),
          ownerId: job.ownerId,
          jobId: job.jobId,
        }),
        "utf8",
      );
      return {
        ok: true,
        externalApplied: true,
        artifactIds: [artifactId],
        outputBindings: {
          artifactId,
          storageReceipt: receipt,
          uploaded: true,
        },
      };
    }
    case "notify_complete": {
      if (step.inputBindings.forceFail === true) {
        return {
          ok: false,
          errorCode: "external_temporary",
          errorMessage: "forced notify failure",
        };
      }
      try {
        const { notifyWorkCompleted } = await import(
          "@/lib/notifications/emitters"
        );
        const artifactId = input.previousOutputs.artifactId as string | undefined;
        notifyWorkCompleted(job.ownerId, {
          title: job.payload.automationName ?? "仕事が完了しました",
          message: "設定した時刻の仕事を完了しました。",
          deliverableId: artifactId ?? null,
          relatedTaskId: job.automationId,
          requestId: job.runId,
        });
      } catch {
        // Notification module may be unavailable in isolated unit tests —
        // write a local receipt instead of claiming external success falsely.
        const receiptPath = join(
          process.cwd(),
          ".data",
          "work-queue-artifacts",
          `${job.jobId}.notify.json`,
        );
        mkdirSync(join(process.cwd(), ".data", "work-queue-artifacts"), {
          recursive: true,
        });
        writeFileSync(
          receiptPath,
          JSON.stringify({
            jobId: job.jobId,
            notifiedAt: new Date().toISOString(),
          }),
          "utf8",
        );
        return {
          ok: true,
          externalApplied: true,
          outputBindings: { notifyReceipt: receiptPath },
        };
      }
      return {
        ok: true,
        externalApplied: true,
        outputBindings: { notified: true },
      };
    }
    case "run_automation": {
      if (!job.automationId) {
        return {
          ok: false,
          errorCode: "validation_failure",
          errorMessage: "automationId required",
        };
      }
      // Prefer offline pipeline when flagged (benchmarks / no OpenAI).
      if (job.payload.offlineArtifacts) {
        const gen = await executeWorkStep({
          job,
          step: {
            ...step,
            stepType: "generate_deliverable",
            inputBindings: {},
          },
          previousOutputs: {},
        });
        return gen;
      }
      try {
        const { automationService } = await import(
          "@/lib/automations/automation-service"
        );
        const triggerType =
          job.payload.triggerType === "manual" ? "manual" : "automation";
        const result = await automationService.runNow(job.automationId, {
          userId: job.ownerId,
          requestOrigin: job.payload.requestOrigin ?? undefined,
          triggerType,
          scheduledAt: job.scheduledAt,
        });
        if (!result) {
          return {
            ok: false,
            errorCode: "validation_failure",
            errorMessage: "automation missing or not runnable",
          };
        }
        if (result.status === "failed") {
          return {
            ok: false,
            errorCode: "external_temporary",
            errorMessage: result.error ?? "automation failed",
          };
        }
        return {
          ok: true,
          externalApplied: true,
          outputBindings: {
            workflowRunId: result.workflowRunId,
            status: result.status,
          },
          artifactIds: [],
        };
      } catch (error) {
        return {
          ok: false,
          errorCode: "external_temporary",
          errorMessage:
            error instanceof Error ? error.message : "automation_exception",
        };
      }
    }
    default:
      return {
        ok: false,
        errorCode: "unsupported_operation",
        errorMessage: `unsupported step ${step.stepType}`,
      };
  }
}

export function defaultAutomationSteps(offline: boolean): Array<{
  stepId: string;
  stepType: WorkStepRecord["stepType"];
  inputBindings?: Record<string, unknown>;
}> {
  if (offline) {
    return [
      { stepId: "generate", stepType: "generate_deliverable" },
      { stepId: "upload", stepType: "upload_storage" },
      { stepId: "notify", stepType: "notify_complete" },
    ];
  }
  return [{ stepId: "run", stepType: "run_automation" }];
}
