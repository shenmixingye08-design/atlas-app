import type { OrchestrationResult } from "@/lib/orchestration/types";
import { getDeliverablePreviewText } from "@/lib/orchestration/deliverable-types";
import {
  resolveActionConnector,
  type ActionConnectorRef,
} from "@/lib/connectors";
import {
  buildConnectionCenterSnapshot,
  evaluateActionExecution,
} from "@/lib/connections";
import { generateCompanyLearning } from "@/lib/learning";
import { generateGrowthReview } from "@/lib/growth";
import { generatePrReview, isCeoApprovedForPr } from "@/lib/pr";
import { ui } from "@/lib/i18n";

import {
  ACTION_EXTENSION_STUBS,
  type ActionDepartmentId,
  type ActionEngineQueue,
  type ActionRequest,
  type ActionStatus,
} from "./types";

function corpus(result: OrchestrationResult): string {
  return [
    result.assignment,
    result.finalResponse,
    getDeliverablePreviewText(result.deliverable),
  ]
    .join("\n")
    .toLowerCase();
}

function isApproved(result: OrchestrationResult): boolean {
  return (
    result.qualityLoop?.ceoApproval?.approved === true || result.approved === true
  );
}

function pushAction(
  actions: ActionRequest[],
  action: Omit<ActionRequest, "id">,
): void {
  actions.push({
    id: `action-${actions.length + 1}`,
    ...action,
  });
}

function connectorAction(
  departmentId: ActionDepartmentId,
  requestedBy: string,
  action: string,
  connectorRef: ActionConnectorRef,
  workflowApproved: boolean,
  snapshot = buildConnectionCenterSnapshot(),
  statusOverride?: ActionStatus,
): Omit<ActionRequest, "id"> {
  const target = resolveActionConnector(connectorRef);
  const evaluation = evaluateActionExecution(
    target,
    snapshot,
    workflowApproved,
    statusOverride === "completed" ? "completed" : undefined,
  );

  return {
    requestedBy,
    departmentId,
    action,
    providerName: target.providerName,
    providerId: target.providerId,
    serviceId: target.serviceId,
    targetService: target.serviceName,
    requiredPermissions: [...target.permissions],
    permissionStatus: evaluation.permissionStatus,
    missingPermissions: evaluation.missingPermissions,
    status: statusOverride ?? evaluation.status,
    readyForExecution: evaluation.readyForExecution,
  };
}

function buildPrActions(
  actions: ActionRequest[],
  result: OrchestrationResult,
  prReview: NonNullable<ReturnType<typeof generatePrReview>>,
): void {
  if (!prReview.shouldShare) return;

  const approved = isApproved(result);
  const strategy = prReview.strategy;
  if (!strategy) return;

  if (strategy.channelPriority.some((c) => c.id === "blog")) {
    pushAction(
      actions,
      connectorAction(
        "pr",
        ui.actionEngine.requestedByPr,
        ui.actionEngine.actionPublishBlog,
        "publish_blog",
        approved,
      ),
    );
  }

  if (strategy.channelPriority.some((c) => c.id === "x")) {
    pushAction(
      actions,
      connectorAction(
        "marketing",
        ui.actionEngine.requestedByMarketing,
        ui.actionEngine.actionScheduleXPost,
        "schedule_social_post",
        approved,
      ),
    );
  }

  if (strategy.channelPriority.some((c) => c.id === "linkedin")) {
    pushAction(
      actions,
      connectorAction(
        "pr",
        ui.actionEngine.requestedByPr,
        ui.actionEngine.actionPublishLinkedIn,
        "publish_linkedin",
        approved,
      ),
    );
  }

  if (prReview.channels.some((c) => c.id === "email" && c.recommended)) {
    pushAction(
      actions,
      connectorAction(
        "marketing",
        ui.actionEngine.requestedByMarketing,
        ui.actionEngine.actionSendEmail,
        "send_email",
        approved,
      ),
    );
  }
}

function buildWorkerActions(
  actions: ActionRequest[],
  result: OrchestrationResult,
): void {
  const text = corpus(result);
  const hasDeliverable = Boolean(getDeliverablePreviewText(result.deliverable));
  const mentionsDrive = /google\s*drive|ドライブ|drive/i.test(text);

  if (!hasDeliverable && !mentionsDrive) return;

  pushAction(
    actions,
    connectorAction(
      "worker",
      ui.actionEngine.requestedByWorker,
      ui.actionEngine.actionSaveGoogleDrive,
      "save_google_drive",
      isApproved(result) && hasDeliverable,
    ),
  );
}

function buildCeoActions(
  actions: ActionRequest[],
  result: OrchestrationResult,
): void {
  if (!isApproved(result) || !getDeliverablePreviewText(result.deliverable)) return;

  pushAction(
    actions,
    connectorAction(
      "ceo",
      ui.actionEngine.requestedByCeo,
      ui.actionEngine.actionExecutiveReport,
      "executive_report",
      true,
    ),
  );
}

function buildLearningActions(
  actions: ActionRequest[],
  learning: ReturnType<typeof generateCompanyLearning>,
): void {
  if (!learning || learning.records.length === 0) return;

  const target = resolveActionConnector("persist_learning");
  const evaluation = evaluateActionExecution(
    target,
    buildConnectionCenterSnapshot(),
    true,
    "completed",
  );

  pushAction(actions, {
    requestedBy: ui.actionEngine.requestedByLearning,
    departmentId: "learning",
    action: ui.actionEngine.actionPersistLearning,
    providerName: target.providerName,
    providerId: target.providerId,
    serviceId: target.serviceId,
    targetService: target.serviceName,
    requiredPermissions: [...target.permissions],
    permissionStatus: evaluation.permissionStatus,
    missingPermissions: evaluation.missingPermissions,
    status: "completed",
    readyForExecution: true,
  });
}

function buildAutomationActions(actions: ActionRequest[]): void {
  pushAction(
    actions,
    connectorAction(
      "automation",
      ui.actionEngine.requestedByAutomation,
      ui.actionEngine.actionStartScheduledWorkflow,
      "start_automation",
      false,
    ),
  );
}

function buildGrowthActions(
  actions: ActionRequest[],
  result: OrchestrationResult,
  growthReview: ReturnType<typeof generateGrowthReview>,
): void {
  if (!growthReview || growthReview.impacts.seoValue !== "high") return;

  pushAction(
      actions,
      connectorAction(
        "growth",
        ui.actionEngine.requestedByGrowth,
        ui.actionEngine.actionScheduleBlogPromotion,
        "schedule_blog_promotion",
        isApproved(result),
    ),
  );
}

function buildResearchActions(
  actions: ActionRequest[],
  result: OrchestrationResult,
): void {
  if (!result.research?.report) return;

  pushAction(
    actions,
    connectorAction(
      "research",
      ui.actionEngine.requestedByResearch,
      ui.actionEngine.actionArchiveResearch,
      "archive_research",
      isApproved(result),
    ),
  );
}

function buildSummary(actions: ActionRequest[]): string {
  const ready = actions.filter((a) => a.readyForExecution).length;
  const waiting = actions.filter((a) => a.status === "waiting").length;
  const completed = actions.filter((a) => a.status === "completed").length;

  if (actions.length === 0) {
    return ui.actionEngine.summaryEmpty;
  }

  return ui.actionEngine.summary(ready, waiting, completed, actions.length);
}

/** Build Action Engine queue from completed workflow (planning only). */
export function generateActionEngineQueue(
  result: OrchestrationResult,
): ActionEngineQueue | null {
  if (result.status !== "completed") {
    return null;
  }

  const actions: ActionRequest[] = [];
  const prReview = generatePrReview(result);
  const growthReview =
    prReview && prReview.shouldShare
      ? generateGrowthReview(prReview, result)
      : null;
  const learning = generateCompanyLearning(result);

  if (prReview && isCeoApprovedForPr(result)) {
    buildPrActions(actions, result, prReview);
  }

  buildWorkerActions(actions, result);
  buildCeoActions(actions, result);
  buildLearningActions(actions, learning);
  buildGrowthActions(actions, result, growthReview);
  buildResearchActions(actions, result);
  buildAutomationActions(actions);

  return {
    actions,
    summary: buildSummary(actions),
    extensions: ACTION_EXTENSION_STUBS,
  };
}

export function actionStatusLabel(status: ActionStatus): string {
  switch (status) {
    case "waiting":
      return ui.actionEngine.statusWaiting;
    case "ready":
      return ui.actionEngine.statusReady;
    case "executing":
      return ui.actionEngine.statusExecuting;
    case "completed":
      return ui.actionEngine.statusCompleted;
    case "failed":
      return ui.actionEngine.statusFailed;
  }
}
