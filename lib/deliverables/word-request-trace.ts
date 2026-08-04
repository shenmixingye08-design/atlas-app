import "server-only";

import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import { getHealthVersionPayload } from "@/lib/health/version-info";
import { persistCommanderResultAsProject, loadPersistedProjectById } from "@/lib/commander/durable-store";
import { generateDeliverables } from "@/lib/deliverables/engine";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { probeDeliverableStorage } from "@/lib/deliverables/object-storage";
import { resetDeliverableMemoryStoreForTests } from "@/lib/deliverables/store";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { resetWordJobsForTests } from "@/lib/deliverables/word-job-stages";
import { createNotification } from "@/lib/notifications/service";
import { findNotification } from "@/lib/notifications/store";
import { decideNotificationResult } from "@/lib/notifications/result-resolution";
import { resolveDeliverableLookupForNotification } from "@/lib/notifications/resolve-deliverable-lookup";
import { resolveNotificationTarget } from "@/lib/notifications/result-target";

export type StepStatus = "success" | "failure" | "skipped";

export type TraceStep = {
  step: number;
  name: string;
  status: StepStatus;
  detail: string | null;
};

const TRACE_USER = "__atlas_word_request_trace__";

const TRACE_CONTENT = [
  "# 依頼トレース確認文書",
  "",
  "## 概要",
  "通知から成果物が開けるかを本番で確認するための固定文書です。",
  "",
  "## 本文",
  "依頼作成から Word 生成・保存・成果物表示・通知・ダウンロードまでの経路を検証します。",
  "日本語本文が十分に含まれること、.docx が PK ヘッダーを持つことを確認します。",
].join("\n");

/**
 * End-to-end Word request trace (no OpenAI, no end-user session).
 * Proves the 9 pipeline checkpoints the product requires.
 */
export async function runWordRequestTrace(input?: {
  requestOrigin?: string;
}): Promise<{
  ok: boolean;
  steps: TraceStep[];
  requestId: string;
  projectId: string | null;
  wordJobId: string | null;
  deliverableFileId: string | null;
  notificationId: string | null;
  downloadUrl: string | null;
  version: ReturnType<typeof getHealthVersionPayload>;
  firstFailureStep: number | null;
}> {
  const version = getHealthVersionPayload();
  const origin = input?.requestOrigin ?? "https://atlasapp.jp";
  const requestId = `trace_${Date.now().toString(36)}`;
  const projectId = `commander-${requestId}`;
  const steps: TraceStep[] = [];

  const push = (
    step: number,
    name: string,
    status: StepStatus,
    detail: string | null,
  ) => {
    steps.push({ step, name, status, detail });
  };

  // 1. Request id created
  push(1, "依頼ID作成", "success", requestId);

  resetWordJobsForTests();
  resetDeliverableMemoryStoreForTests();
  resetDurableDeliverableStoreForTests();

  const storage = await probeDeliverableStorage();

  // 2–4 Word job / generate / storage
  let wordJobId: string | null = null;
  let deliverableFileId: string | null = null;
  let downloadUrl: string | null = null;
  let wordFiles: Awaited<ReturnType<typeof generateDeliverables>>["deliverables"] =
    [];

  try {
    const generated = await generateDeliverables(
      {
        assignment: "依頼トレース用のWordファイルを作成してください",
        finalDeliverable: TRACE_CONTENT,
        title: "依頼トレース確認文書",
        formats: ["docx"],
      },
      origin,
      {
        userId: TRACE_USER,
        jobId: `cmdword_${requestId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`,
        suppressWordReadyNotification: true,
        contentAlreadyApproved: true,
      },
    );
    wordJobId = generated.jobId ?? null;
    push(
      2,
      "Word生成ジョブ開始",
      wordJobId ? "success" : "failure",
      wordJobId,
    );

    const docx = generated.deliverables.find((d) => d.format === "docx");
    if (!docx) {
      push(
        3,
        ".docx生成",
        "failure",
        generated.failures.map((f) => f.reasons.join(",")).join(";") ||
          "docx_not_produced",
      );
      push(4, "ストレージ保存", "skipped", "docx missing");
    } else {
      wordFiles = generated.deliverables;
      deliverableFileId = docx.id;
      downloadUrl = docx.downloadUrl;
      push(3, ".docx生成", "success", docx.id);

      resetDeliverableMemoryStoreForTests();
      resetDurableDeliverableStoreForTests();
      const reloaded = await getStoredDeliverableForUser(docx.id, TRACE_USER, {
        bypassMemory: true,
        bypassDisk: true,
      });
      const storedOk = Boolean(
        reloaded?.buffer?.byteLength &&
          reloaded.buffer[0] === 0x50 &&
          reloaded.buffer[1] === 0x4b,
      );
      push(
        4,
        "ストレージ保存",
        storedOk ? "success" : "failure",
        storedOk
          ? `bytes=${reloaded!.buffer.byteLength};backend=${storage.backend}`
          : `reload_failed;storageReady=${storage.ready}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "generate_exception";
    push(2, "Word生成ジョブ開始", "failure", message);
    push(3, ".docx生成", "skipped", null);
    push(4, "ストレージ保存", "skipped", null);
  }

  // 5–6 Project record
  const orchestration: OrchestrationResult = {
    assignment: "依頼トレース用のWordファイルを作成してください",
    status: "completed",
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable: {
      ...emptyDeliverable("document"),
      title: "依頼トレース確認文書",
      markdown: TRACE_CONTENT,
      content: TRACE_CONTENT,
      plainText: TRACE_CONTENT,
    },
    reviewComments: "",
    approved: true,
    finalResponse: "依頼トレース用の文書を作成しました。",
    totalDurationMs: 1,
    workflow: hydrateWorkflowState({ status: "completed", approved: true }),
    commanderRunId: requestId,
    fileDeliverables: wordFiles,
  };

  const persistedId = await persistCommanderResultAsProject({
    userId: TRACE_USER,
    assignment: orchestration.assignment,
    result: orchestration,
    projectId,
  });

  push(
    5,
    "成果物レコード作成",
    persistedId ? "success" : "failure",
    persistedId,
  );

  const loaded = await loadPersistedProjectById({
    userId: TRACE_USER,
    projectId,
  });
  const idsOk =
    loaded.found &&
    loaded.project?.id === projectId &&
    // user ownership is enforced by the query eq user_id
    Boolean(loaded.project);
  push(
    6,
    "成果物レコードの依頼ID・ユーザーID",
    idsOk ? "success" : "failure",
    idsOk
      ? `projectId=${projectId};userId=${TRACE_USER}`
      : `found=${loaded.found};durable=${loaded.durable}`,
  );

  // 7–8 Notification
  let notificationId: string | null = null;
  // Intentionally use project id (correct) — mirrors the execute.ts fix.
  const notification = await createNotification({
    audience: "user",
    userId: TRACE_USER,
    type: "completed",
    title: "Wordファイルの準備ができました",
    message: "依頼トレースのWordファイルを作成しました。",
    relatedTaskId: projectId,
    actionUrl: `/projects/${encodeURIComponent(projectId)}`,
    targetType: "deliverable",
    targetId: projectId,
    deliverableId: projectId,
    requestId,
    lineEvent: "work_completed",
  });
  if (!notification) {
    push(7, "通知レコード作成", "failure", "createNotification returned null");
    push(8, "通知→成果物ID参照", "skipped", null);
    push(9, "本番データ取得（成果物表示解決）", "skipped", null);
  } else {
    notificationId = notification.notificationId;
    const foundNotification = findNotification(notificationId);
    push(
      7,
      "通知レコード作成",
      foundNotification ? "success" : "failure",
      notificationId,
    );

    const target = foundNotification
      ? resolveNotificationTarget(foundNotification)
      : { kind: "none" as const };
    const pointsToProject =
      target.kind === "deliverable" && target.targetId === projectId;
    push(
      8,
      "通知→成果物ID参照",
      pointsToProject ? "success" : "failure",
      target.kind === "none" ? "no_target" : `${target.kind}:${target.targetId}`,
    );

    // 9 Results resolution against durable store (latest data)
    let step9: StepStatus = "failure";
    let step9Detail: string | null = "not_run";
    if (foundNotification) {
      const resolved = await resolveDeliverableLookupForNotification({
        notification: foundNotification,
        userId: TRACE_USER,
      });
      const decision = decideNotificationResult({
        notification: foundNotification,
        requesterUserId: TRACE_USER,
        lookup: resolved.lookup,
      });
      const ok =
        decision.status === "deliverable" &&
        Boolean(resolved.project) &&
        resolved.project?.id === projectId;
      step9 = ok ? "success" : "failure";
      step9Detail = JSON.stringify({
        decision: decision.status,
        code: decision.status === "error" ? decision.code : null,
        resolvedProjectId: resolved.resolvedProjectId,
        displayKind:
          resolved.lookup.durable && resolved.lookup.found
            ? resolved.lookup.displayKind
            : null,
        wordFileFound: resolved.trace.wordFileFound,
      });
    }
    push(9, "本番データ取得（成果物表示解決）", step9, step9Detail);
  }

  const firstFailureStep =
    steps.find((s) => s.status === "failure")?.step ?? null;

  return {
    ok: firstFailureStep === null,
    steps,
    requestId,
    projectId: persistedId,
    wordJobId,
    deliverableFileId,
    notificationId,
    downloadUrl,
    version,
    firstFailureStep,
  };
}
