import "server-only";

import { runCommanderRequest } from "@/lib/commander/service";
import { generateDeliverablesForWorkJob } from "@/lib/deliverables/work-job-export";
import {
  logWorkPipeline,
  logWorkPipelineFailure,
} from "@/lib/deliverables/work-pipeline-log";
import { recordReliabilityEvent, withRetry } from "@/lib/reliability";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";

import { getWorkJob, saveWorkJob, type WorkJobRecord } from "./store";

/**
 * Execute a queued work job on the server (not in the browser).
 * Retries transient failures up to maxAttempts with backoff.
 * Idempotent: completed / running jobs are not re-executed.
 *
 * After AI content succeeds, downloadable files (Word/PDF/…) are generated
 * server-side so closing the browser does not lose the Word pipeline.
 */
export async function executeWorkJob(
  jobId: string,
  userId: string,
): Promise<WorkJobRecord> {
  const existing = getWorkJob(jobId, userId);
  if (!existing) {
    throw new Error("job_not_found");
  }

  // Duplicate execution forbidden.
  if (existing.status === "completed" || existing.status === "awaiting_confirmation") {
    return existing;
  }
  if (existing.status === "running") {
    return existing;
  }

  const startedAt = Date.now();
  logWorkPipeline("AI_CONTENT_STARTED", {
    jobId,
    userId,
    durationMs: 0,
  });
  saveWorkJob({
    ...existing,
    status: "running",
    attemptCount: existing.attemptCount + 1,
    fileDeliverableStatus: "pending",
    updatedAt: new Date().toISOString(),
  });

  try {
    const commander = await withRetry(
      async (attempt) => {
        if (attempt > 1) {
          recordReliabilityEvent("retry", "retry");
          recordReliabilityEvent("work_job", "retry");
        }
        return runCommanderRequest({
          userId,
          request: {
            assignment: existing.assignment,
            mode: "execute",
            metadata: {
              requestUi: "secretary_zero_friction_v1",
              ...(existing.metadata ?? {}),
              workJobId: jobId,
              idempotencyKey: existing.idempotencyKey,
            },
          },
        });
      },
      { maxAttempts: existing.maxAttempts },
    );

    if (commander.status === "awaiting_confirmation") {
      return saveWorkJob({
        ...existing,
        status: "awaiting_confirmation",
        attemptCount: Math.max(existing.attemptCount + 1, 1),
        result: commander.result ?? null,
        error: null,
        fileDeliverables: null,
        fileDeliverableFailures: null,
        fileDeliverableStatus: "skipped",
        fileDeliverableMatchedRule: null,
        updatedAt: new Date().toISOString(),
      });
    }

    // Vision / attachment hard failures must surface as failed jobs — never "completed".
    if (commander.visionGate && !commander.visionGate.analysisSuccess) {
      recordReliabilityEvent("work_job", "failure", 1, {
        durationMs: Date.now() - startedAt,
        errorMessage: commander.visionGate.message,
      });
      logWorkPipelineFailure(
        "AI_CONTENT_STARTED",
        new Error(commander.visionGate.message),
        { jobId, userId, durationMs: Date.now() - startedAt },
      );
      return saveWorkJob({
        ...existing,
        status: "failed",
        attemptCount: existing.attemptCount + 1,
        error: commander.visionGate.message,
        result: null,
        fileDeliverables: null,
        fileDeliverableFailures: null,
        fileDeliverableStatus: "failed",
        fileDeliverableMatchedRule: null,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }

    if (commander.status === "failed" || !commander.result) {
      recordReliabilityEvent("work_job", "failure", 1, {
        durationMs: Date.now() - startedAt,
        errorMessage: commander.report?.summary ?? "failed",
      });
      logWorkPipelineFailure(
        "AI_CONTENT_STARTED",
        new Error(commander.report?.summary ?? "ai_content_failed"),
        { jobId, userId, durationMs: Date.now() - startedAt },
      );
      return saveWorkJob({
        ...existing,
        status: "failed",
        attemptCount: existing.attemptCount + 1,
        error: toHumanReliabilityMessage(
          commander.visionGate?.message ??
            commander.report?.summary ??
            "文書内容の作成に失敗しました。自動再試行します。",
        ),
        result: commander.result ?? null,
        fileDeliverables: null,
        fileDeliverableFailures: null,
        fileDeliverableStatus: "failed",
        fileDeliverableMatchedRule: null,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }

    logWorkPipeline("AI_CONTENT_COMPLETED", {
      jobId,
      userId,
      workflowId: commander.result.knowledge?.workflowId ?? null,
      durationMs: Date.now() - startedAt,
    });

    const orchestrationResult = {
      ...commander.result,
      ...(commander.runId ? { commanderRunId: commander.runId } : {}),
    };

    // Persist AI result first (not yet WORK_COMPLETED — files may still fail).
    saveWorkJob({
      ...existing,
      status: "running",
      attemptCount: existing.attemptCount + 1,
      result: orchestrationResult,
      error: null,
      fileDeliverableStatus: "pending",
      updatedAt: new Date().toISOString(),
    });

    const fileExport = await generateDeliverablesForWorkJob({
      jobId,
      userId,
      assignment: existing.assignment,
      result: orchestrationResult,
      metadata: existing.metadata ?? {},
    });

    if (fileExport.status === "failed" && fileExport.wordRequired) {
      recordReliabilityEvent("work_job", "failure", 1, {
        durationMs: Date.now() - startedAt,
        errorMessage: fileExport.userError ?? "word_export_failed",
      });
      logWorkPipelineFailure(
        "DOCX_STORE_STARTED",
        new Error(fileExport.userError ?? "word_export_failed"),
        {
          jobId,
          userId,
          format: "docx",
          durationMs: Date.now() - startedAt,
        },
      );
      return saveWorkJob({
        ...existing,
        status: "failed",
        attemptCount: existing.attemptCount + 1,
        result: orchestrationResult,
        error: fileExport.userError,
        fileDeliverables: fileExport.deliverables,
        fileDeliverableFailures: fileExport.failures,
        fileDeliverableStatus: "failed",
        fileDeliverableMatchedRule: fileExport.matchedRule,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }

    recordReliabilityEvent("work_job", "success", 1, {
      durationMs: Date.now() - startedAt,
    });
    logWorkPipeline("WORK_COMPLETED", {
      jobId,
      userId,
      workflowId: orchestrationResult.knowledge?.workflowId ?? null,
      format: fileExport.deliverables.map((d) => d.format).join(",") || null,
      deliverableId: fileExport.deliverables[0]?.id ?? null,
      generatedFileSize: fileExport.deliverables[0]?.sizeBytes ?? null,
      durationMs: Date.now() - startedAt,
    });
    // Notification is owned by Commander; failures there must not fail this job.
    logWorkPipeline("NOTIFICATION_SENT", {
      jobId,
      userId,
      workflowId: orchestrationResult.knowledge?.workflowId ?? null,
      deliverableId: fileExport.deliverables.find((d) => d.format === "docx")?.id ??
        fileExport.deliverables[0]?.id ??
        null,
    });

    return saveWorkJob({
      ...existing,
      status: "completed",
      attemptCount: existing.attemptCount + 1,
      result: orchestrationResult,
      error: null,
      fileDeliverables: fileExport.deliverables,
      fileDeliverableFailures: fileExport.failures,
      fileDeliverableStatus:
        fileExport.deliverables.length > 0 ? "completed" : "skipped",
      fileDeliverableMatchedRule: fileExport.matchedRule,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = toHumanReliabilityMessage(error);
    const isTimeout = /timeout|ETIMEDOUT|aborted/i.test(message);
    recordReliabilityEvent("work_job", isTimeout ? "timeout" : "failure", 1, {
      durationMs: Date.now() - startedAt,
      errorMessage: message,
    });
    if (isTimeout) recordReliabilityEvent("timeout", "timeout");
    logWorkPipelineFailure("AI_CONTENT_STARTED", error, {
      jobId,
      userId,
      durationMs: Date.now() - startedAt,
    });
    return saveWorkJob({
      ...existing,
      status: "failed",
      attemptCount: existing.attemptCount + 1,
      error: message,
      fileDeliverableStatus: "failed",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
  }
}
