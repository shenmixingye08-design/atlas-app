/**
 * Client-side activation runner: create weekly report automation → test run →
 * require a real downloadable Word artifact.
 */

import {
  createAutomationV2,
  fetchAutomationRun,
  runAutomationV2,
} from "@/lib/automation-platform/client";
import type { AutomationRun } from "@/lib/automation-platform/types";
import {
  buildWeeklyReportCreateInput,
  WEEKLY_REPORT_TEMPLATE_ID,
} from "@/lib/activation/weekly-report-template";
import type {
  ActivationFailureInfo,
  ActivationResult,
  WeeklyReportConfig,
} from "@/lib/activation/types";
import { trackActivationEvent } from "@/lib/activation/analytics";
import {
  incrementActivationRetry,
  markActivationCompleted,
  saveActivationState,
} from "@/lib/activation/store";

const TERMINAL = new Set([
  "succeeded",
  "partially_succeeded",
  "failed",
  "cancelled",
  "expired",
  "skipped",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickDeliverableArtifact(run: AutomationRun): {
  fileName: string;
  downloadUrl: string;
} | null {
  const artifact = run.artifacts.find(
    (item) =>
      item.kind === "deliverable" &&
      typeof item.url === "string" &&
      item.url.trim().length > 0,
  );
  if (!artifact?.url) return null;
  return {
    fileName: artifact.label || "週次営業報告書.docx",
    downloadUrl: artifact.url,
  };
}

function failureFromRun(run: AutomationRun): ActivationFailureInfo {
  const stage =
    run.lastErrorCode?.includes("deliverable") ||
    run.lastErrorMessage?.includes("成果物")
      ? "deliverable"
      : "run";
  return {
    stage,
    message:
      run.lastErrorMessage?.trim() ||
      "処理を完了できませんでした。内容をご確認のうえ、再実行してください。",
    userCanFix: Boolean(run.needsUserInput),
    diagnosticId: run.diagnosticId || null,
    retryable: true,
  };
}

async function waitForTerminalRun(
  runId: string,
  options?: { timeoutMs?: number; pollMs?: number },
): Promise<AutomationRun> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const pollMs = options?.pollMs ?? 800;
  const started = Date.now();
  let latest = await fetchAutomationRun(runId);

  while (!TERMINAL.has(latest.status) && Date.now() - started < timeoutMs) {
    await sleep(pollMs);
    latest = await fetchAutomationRun(runId);
  }
  return latest;
}

export type RunWeeklyReportActivationResult =
  | { ok: true; result: ActivationResult }
  | { ok: false; failure: ActivationFailureInfo };

export async function runWeeklyReportActivation(input: {
  config: WeeklyReportConfig;
  /** Reuse existing automation on retry to avoid duplicates. */
  existingAutomationId?: string | null;
  idempotencyKey?: string;
}): Promise<RunWeeklyReportActivationResult> {
  const startedAt = Date.now();
  let automationId = input.existingAutomationId?.trim() || null;

  try {
    if (!automationId) {
      trackActivationEvent("automation_draft_created", {
        templateId: WEEKLY_REPORT_TEMPLATE_ID,
      });
      const created = await createAutomationV2(
        buildWeeklyReportCreateInput(input.config),
      );
      automationId = created.id;
      saveActivationState({ automationId });
    }

    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      `activation:${automationId}:${Math.floor(Date.now() / 60_000)}`;

    trackActivationEvent("first_test_run_started", {
      templateId: WEEKLY_REPORT_TEMPLATE_ID,
      automationId,
    });

    const { run, created } = await runAutomationV2(
      automationId,
      idempotencyKey,
    );
    saveActivationState({ runId: run.id });

    // Deduped completed run with artifact still counts as success.
    let finalRun = run;
    if (!TERMINAL.has(run.status)) {
      finalRun = await waitForTerminalRun(run.id);
    } else if (!created && run.status === "succeeded") {
      finalRun = run;
    }

    if (finalRun.status === "failed" || finalRun.status === "cancelled") {
      trackActivationEvent("first_test_run_failed", {
        templateId: WEEKLY_REPORT_TEMPLATE_ID,
        automationId,
        diagnosticId: finalRun.diagnosticId,
        status: finalRun.status,
      });
      return { ok: false, failure: failureFromRun(finalRun) };
    }

    const artifact = pickDeliverableArtifact(finalRun);
    if (!artifact) {
      trackActivationEvent("first_test_run_failed", {
        templateId: WEEKLY_REPORT_TEMPLATE_ID,
        automationId,
        diagnosticId: finalRun.diagnosticId,
        reason: "missing_artifact_url",
      });
      return {
        ok: false,
        failure: {
          stage: "deliverable",
          message:
            "成果物ファイルを確認できませんでした。再実行してください。",
          userCanFix: false,
          diagnosticId: finalRun.diagnosticId || null,
          retryable: true,
        },
      };
    }

    // Require app download URL (storage-backed), not a blank success.
    if (!artifact.downloadUrl.includes("/api/deliverables/")) {
      return {
        ok: false,
        failure: {
          stage: "storage",
          message:
            "成果物の保存を確認できませんでした。再実行してください。",
          userCanFix: false,
          diagnosticId: finalRun.diagnosticId || null,
          retryable: true,
        },
      };
    }

    const durationMs = Date.now() - startedAt;
    const result: ActivationResult = {
      automationId,
      runId: finalRun.id,
      diagnosticId: finalRun.diagnosticId || null,
      fileName: artifact.fileName,
      downloadUrl: artifact.downloadUrl,
      formatLabel: "Word",
      createdAt: finalRun.completedAt ?? finalRun.updatedAt,
      nextRunAt: null, // filled by caller from automation fetch
      durationMs,
    };

    trackActivationEvent("first_artifact_created", {
      templateId: WEEKLY_REPORT_TEMPLATE_ID,
      automationId,
      runId: finalRun.id,
      time_to_first_artifact_ms: durationMs,
      steps_to_first_artifact: 4,
    });

    markActivationCompleted({
      automationId,
      runId: finalRun.id,
      artifactUrl: artifact.downloadUrl,
    });

    trackActivationEvent("first_experience_completed", {
      templateId: WEEKLY_REPORT_TEMPLATE_ID,
      automationId,
      time_to_first_artifact_ms: durationMs,
    });

    return { ok: true, result };
  } catch (error) {
    incrementActivationRetry();
    const message =
      error instanceof Error
        ? error.message
        : "初回体験の実行に失敗しました";
    const diagnosticId =
      error && typeof error === "object" && "details" in error
        ? null
        : null;
    trackActivationEvent("first_test_run_failed", {
      templateId: WEEKLY_REPORT_TEMPLATE_ID,
      automationId,
      reason: "exception",
    });
    return {
      ok: false,
      failure: {
        stage: automationId ? "run" : "create",
        message,
        userCanFix: true,
        diagnosticId,
        retryable: true,
      },
    };
  }
}
