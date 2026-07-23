import {
  getStepDefinition,
  getWorkflowTemplate,
  isExternalIntegration,
  WORKFLOW_TEMPLATES,
} from "./workflow-templates";
import type {
  WorkExecutionFlow,
  WorkflowStepState,
  WorkflowTemplateId,
} from "./types";

export const DEFAULT_WORKFLOW_TEMPLATE: WorkflowTemplateId = "generic";

/** Infer a workflow template from job title or assignment text. */
export function inferWorkflowTemplate(text: string): WorkflowTemplateId {
  const normalized = text.toLowerCase();

  if (/sns|x\(|twitter|投稿|instagram|インスタ|ココナラ/.test(normalized)) {
    return "sns_post";
  }
  if (/ブログ|blog|wordpress|記事/.test(normalized)) {
    return "blog";
  }
  if (/営業資料|プレゼン|powerpoint|pptx|ppt/.test(normalized)) {
    return "sales_material";
  }
  if (/動画|youtube|ユーチューブ|video/.test(normalized)) {
    return "video";
  }

  return DEFAULT_WORKFLOW_TEMPLATE;
}

function defaultStepEnabled(
  templateId: WorkflowTemplateId,
  stepId: string,
): boolean {
  const step = getStepDefinition(templateId, stepId);
  if (!step) return true;
  if (step.integration === "manual") return false;
  return !isExternalIntegration(step.integration);
}

/** Build a fresh flow with all template steps and sensible defaults. */
export function createDefaultExecutionFlow(
  templateId: WorkflowTemplateId = DEFAULT_WORKFLOW_TEMPLATE,
): WorkExecutionFlow {
  const template = getWorkflowTemplate(templateId);
  return {
    templateId,
    steps: template.steps.map((step) => ({
      id: step.id,
      enabled: defaultStepEnabled(templateId, step.id),
    })),
  };
}

/** Merge stored step toggles with the current template definition. */
export function normalizeExecutionFlow(
  flow?: WorkExecutionFlow | null,
): WorkExecutionFlow {
  if (!flow?.templateId || !WORKFLOW_TEMPLATES[flow.templateId]) {
    return createDefaultExecutionFlow();
  }

  const enabledById = new Map(
    (flow.steps ?? []).map((step) => [step.id, step.enabled]),
  );

  const template = getWorkflowTemplate(flow.templateId);
  return {
    templateId: flow.templateId,
    steps: template.steps.map((step) => ({
      id: step.id,
      enabled: enabledById.has(step.id)
        ? Boolean(enabledById.get(step.id))
        : defaultStepEnabled(flow.templateId, step.id),
    })),
  };
}

export function getEnabledSteps(flow: WorkExecutionFlow): WorkflowStepState[] {
  const normalized = normalizeExecutionFlow(flow);
  return normalized.steps.filter((step) => step.enabled);
}

export function getEnabledStepIds(flow: WorkExecutionFlow): string[] {
  return getEnabledSteps(flow).map((step) => step.id);
}

export function getEnabledStepLabels(flow: WorkExecutionFlow): string[] {
  const normalized = normalizeExecutionFlow(flow);
  return normalized.steps
    .filter((step) => step.enabled)
    .map((step) => getStepDefinition(normalized.templateId, step.id)?.label ?? step.id);
}

export function getDisabledStepLabels(flow: WorkExecutionFlow): string[] {
  const normalized = normalizeExecutionFlow(flow);
  return normalized.steps
    .filter((step) => !step.enabled)
    .map((step) => getStepDefinition(normalized.templateId, step.id)?.label ?? step.id);
}

export function toggleExecutionFlowStep(
  flow: WorkExecutionFlow,
  stepId: string,
  enabled: boolean,
): WorkExecutionFlow {
  const normalized = normalizeExecutionFlow(flow);
  return {
    ...normalized,
    steps: normalized.steps.map((step) =>
      step.id === stepId ? { ...step, enabled } : step,
    ),
  };
}

export function setExecutionFlowTemplate(
  templateId: WorkflowTemplateId,
): WorkExecutionFlow {
  return createDefaultExecutionFlow(templateId);
}

/** True when the job text asks to actually publish (not just draft copy). */
export function hasPublishIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  const publish =
    /投稿|ポスト|つぶや|ツイート|tweet|post/.test(normalized) &&
    /投稿|ポスト|つぶや|ツイート|tweet|post|して|する|上げ|公開/.test(text);
  const draftOnly =
    /下書き|ドラフト|草案|文面だけ|文面のみ|作成だけ|作成のみ|準備だけ|保存だけ|案を(作|考)/.test(
      text,
    );
  return publish && !draftOnly;
}

/**
 * For SNS jobs with explicit publish intent, enable the publish step so the
 * schedule tick can complete X投稿 end-to-end. Does not change executionLevel.
 */
export function applyExternalPublishIntent(
  flow: WorkExecutionFlow,
  jobText: string,
): WorkExecutionFlow {
  const normalized = normalizeExecutionFlow(flow);
  if (normalized.templateId !== "sns_post") return normalized;
  if (!hasPublishIntent(jobText)) return normalized;
  return {
    ...normalized,
    steps: normalized.steps.map((step) => {
      if (step.id === "publish") return { ...step, enabled: true };
      // Prefer immediate publish over schedule_post when intent is clear.
      if (step.id === "schedule_post") return { ...step, enabled: false };
      return step;
    }),
  };
}

/** Compact one-line summary for cards and lists. */
export function formatExecutionFlowSummary(flow: WorkExecutionFlow): string {
  const labels = getEnabledStepLabels(flow);
  if (labels.length === 0) return "工程なし";
  return labels.join(" → ");
}

/** Augment assignment so orchestration respects enabled steps only. */
export function buildExecutionFlowContext(flow: WorkExecutionFlow): string {
  const normalized = normalizeExecutionFlow(flow);
  const enabled = getEnabledStepLabels(normalized);
  const disabled = getDisabledStepLabels(normalized);

  if (enabled.length === 0) {
    return "【実行フロー】有効な工程がありません。計画のみ提示してください。";
  }

  const enabledLine = `担当する工程: ${enabled.join(" → ")}`;
  const disabledLine =
    disabled.length > 0 ? `スキップする工程: ${disabled.join("、")}` : "";

  return ["【実行フロー】以下の工程のみ実行してください。", enabledLine, disabledLine]
    .filter(Boolean)
    .join("\n");
}
