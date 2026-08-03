/**
 * Dispatch queued / due-retry runs into the executor.
 */

import "server-only";

import { executeQueuedRun } from "@/lib/automation-platform/execution/executor";
import { notifyAutomationRunEvent } from "@/lib/automation-platform/execution/notify";
import type { StepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import {
  memoryClaimRun,
  memoryGetAutomation,
  memoryGetRun,
  memoryListDispatchableRuns,
  memoryUpdateRun,
} from "@/lib/automation-platform/repository/memory-store";
import { createStatusTransition } from "@/lib/automation-platform/state-machine/transitions";
import { persistAutomationRunNow } from "@/lib/automation-platform/durable-runs";
import type { AutomationRun } from "@/lib/automation-platform/types";

export type DispatchResult = {
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
  awaiting: number;
};

function buildCalendarNotificationDetail(run: AutomationRun): string | null {
  const calendar = run.completionEvidence?.calendarResults?.[0];
  if (calendar) {
    if (calendar.action === "cancel") {
      return [
        "予定をキャンセルしました。",
        `日時: ${calendar.startDateTime}〜${calendar.endDateTime}`,
      ].join(" ");
    }
    if (calendar.action === "update") {
      return [
        "予定を更新しました。",
        calendar.htmlLink ? `URL: ${calendar.htmlLink}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    }
    return [
      "Google Calendarへ予定を登録しました。",
      `日時: ${calendar.startDateTime}〜${calendar.endDateTime} (${calendar.timezone})`,
      calendar.htmlLink ? `URL: ${calendar.htmlLink}` : "",
      calendar.hangoutLink ? `Meet: ${calendar.hangoutLink}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const message = run.lastErrorMessage ?? run.resultSummary ?? "";
  if (/missing_scope|権限/i.test(message)) {
    return "権限不足です。Google Calendarを再接続してください。";
  }
  if (/reconnect|再接続|revok|expired|401/i.test(message)) {
    return "再接続が必要です。Google連携をやり直してください。";
  }
  if (/datetime|日時/i.test(message)) {
    return "日時が不正です。";
  }
  if (/attendee|参加/i.test(message)) {
    return "参加者が不正です。";
  }
  if (/approval|承認/i.test(message)) {
    return "Google Calendar操作の承認待ちです。";
  }
  if (/retry|429|rate limit/i.test(message)) {
    return "Google Calendar API制限のため再試行中です。";
  }
  return null;
}

function buildGmailNotificationDetail(run: AutomationRun): string | null {
  const gmail = run.completionEvidence?.gmailResults?.[0];
  if (gmail) {
    const isSend = Boolean(gmail.messageId) && gmail.action !== "draft";
    if (isSend) {
      return [
        "Gmailで送信しました。",
        `宛先ハッシュ: ${gmail.recipientHash.slice(0, 8)}…`,
        `添付数: ${gmail.attachmentArtifactIds.length}`,
        `messageId: ${gmail.messageId}`,
        `実行時刻: ${gmail.completedAt}`,
        "（Provider受付済み）",
      ].join(" ");
    }
    return [
      "Gmail下書きを作成しました。",
      `添付数: ${gmail.attachmentArtifactIds.length}`,
      `draftId: ${gmail.draftId}`,
      gmail.deliveryGuarantee === "not_applicable"
        ? "承認待ちの場合は送信前に確認してください。"
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const message = run.lastErrorMessage ?? run.resultSummary ?? "";
  if (/missing_scope|権限/i.test(message)) {
    return "権限不足です。Gmailを再接続してください。";
  }
  if (/reconnect|再接続|revok|expired|401/i.test(message)) {
    return "再接続が必要です。Google連携をやり直してください。";
  }
  if (/invalid recipient|宛先/i.test(message)) {
    return "宛先が不正です。";
  }
  if (/attachment|添付/i.test(message)) {
    return "添付ファイルの取得に失敗しました。";
  }
  if (/retry|429|rate limit/i.test(message)) {
    return "Gmail API制限のため再試行中です。";
  }
  if (/approval|承認/i.test(message)) {
    return "Gmail送信の承認待ちです。下書きは作成済みの場合があります。";
  }
  return null;
}

function buildGoogleDriveNotificationDetail(run: AutomationRun): string | null {
  const drive = run.completionEvidence?.driveResults?.[0];
  if (drive) {
    return [
      "Google Driveへ保存しました。",
      `ファイル: ${drive.fileName}`,
      `フォルダID: ${drive.targetFolderId}`,
      `URL: ${drive.webViewLink}`,
      `実行時刻: ${drive.completedAt}`,
    ].join(" ");
  }

  const external = run.artifacts.find(
    (item) => item.kind === "external" && item.externalId && item.url,
  );
  if (external?.url) {
    return `Google Driveへ保存しました。ファイル: ${external.label} URL: ${external.url}`;
  }

  const message = run.lastErrorMessage ?? "";
  if (/missing_scope|権限/i.test(message)) {
    return "権限不足です。Google Driveを再接続してください。";
  }
  if (/reconnect|再接続|revok|expired|401/i.test(message)) {
    return "再接続が必要です。Google連携をやり直してください。";
  }
  if (/folder.*not found|フォルダ/i.test(message)) {
    return "folder不存在、またはアクセスできません。";
  }
  if (/retry|429|rate limit/i.test(message)) {
    return "Retry中または一時的な制限です。";
  }
  return null;
}

function buildExternalNotificationDetail(run: AutomationRun): string | null {
  return (
    buildGmailNotificationDetail(run) ||
    buildCalendarNotificationDetail(run) ||
    buildGoogleDriveNotificationDetail(run)
  );
}

function attachClaimTransition(run: AutomationRun): AutomationRun {
  if (run.status !== "running") return run;
  const last = run.statusHistory[run.statusHistory.length - 1];
  if (last?.nextStatus === "running") return run;
  const previousStatus = last?.nextStatus;
  const from =
    previousStatus === "retrying" || previousStatus === "queued"
      ? previousStatus
      : run.attemptCount > 0
        ? "retrying"
        : "queued";
  try {
    const entry = createStatusTransition({
      previousStatus: from,
      nextStatus: "running",
      reason: "dispatch_claim",
      actor: { type: "worker", component: "dispatch" },
      diagnosticId: run.diagnosticId || crypto.randomUUID(),
    });
    const updated = {
      ...run,
      statusHistory: [...run.statusHistory, entry],
      updatedAt: entry.timestamp,
    };
    return persistAutomationRunNow(memoryUpdateRun(updated));
  } catch {
    return run;
  }
}

export async function dispatchAutomationRuns(options?: {
  limit?: number;
  invoker?: StepInvoker;
  runIds?: string[];
}): Promise<DispatchResult> {
  const result: DispatchResult = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    retrying: 0,
    awaiting: 0,
  };

  const candidates =
    options?.runIds && options.runIds.length > 0
      ? options.runIds
          .map((id) => memoryGetRun(id))
          .filter((run): run is AutomationRun => Boolean(run))
      : memoryListDispatchableRuns(options?.limit ?? 20);

  for (const candidate of candidates) {
    const claimed = memoryClaimRun(candidate.id);
    if (!claimed) continue;

    const withHistory = attachClaimTransition(claimed);
    const automation = memoryGetAutomation(withHistory.automationId);
    if (!automation) {
      const failed = persistAutomationRunNow(
        memoryUpdateRun({
          ...withHistory,
          status: "failed",
          lastErrorCode: "automation_not_found",
          lastErrorMessage: "自動化定義が見つかりません",
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );
      result.processed += 1;
      result.failed += 1;
      notifyAutomationRunEvent({
        userId: failed.userId,
        automationName: withHistory.automationName,
        run: failed,
        policy: {
          beforeRun: false,
          onSuccess: true,
          onFailure: true,
          onNeedsInput: true,
          channels: ["in_app"],
        },
        event: "failed",
      });
      continue;
    }

    const wasRetry = candidate.status === "retrying";
    if (wasRetry) {
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: withHistory,
        policy: automation.notificationPolicy,
        event: "retry_started",
      });
    } else {
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: withHistory,
        policy: automation.notificationPolicy,
        event: "started",
      });
    }

    // Executor expects queued/retrying — restore claimable previous for its transition
    // We already claimed to running; pass a synthetic queued shell by resetting status
    // only inside executor input while keeping id. Simpler: update executor to accept running.
    const execResult = await executeQueuedRun({
      run: withHistory,
      automation,
      invoker: options?.invoker ?? strictStepInvoker,
    });

    result.processed += 1;
    const externalDetail = buildExternalNotificationDetail(execResult.run);
    if (execResult.run.status === "succeeded") {
      result.succeeded += 1;
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: wasRetry ? "retry_finished" : "succeeded",
        detail: externalDetail,
      });
    } else if (execResult.run.status === "partially_succeeded") {
      result.failed += 1;
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: "partially_succeeded",
        detail: externalDetail,
      });
    } else if (execResult.run.status === "failed") {
      result.failed += 1;
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: "failed",
        detail:
          externalDetail ||
          execResult.run.lastErrorMessage ||
          "外部連携または自動化の最終失敗",
      });
    } else if (execResult.run.status === "retrying") {
      result.retrying += 1;
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: "retry_started",
        detail: externalDetail || "外部連携操作を再試行します",
      });
    } else if (execResult.run.status === "needs_input") {
      result.awaiting += 1;
      notifyAutomationRunEvent({
        userId: automation.userId,
        automationName: automation.name,
        run: execResult.run,
        policy: automation.notificationPolicy,
        event: "needs_input",
        detail:
          externalDetail ||
          execResult.run.resultSummary ||
          execResult.run.lastErrorMessage ||
          "再接続・権限・承認の確認が必要です",
      });
    }
  }

  return result;
}
