import "server-only";

import {
  createDefaultExecutionFlow,
  getEnabledStepLabels,
} from "@/lib/automations/execution-flow";
import { getWorkflowTemplate } from "@/lib/automations/workflow-templates";
import { getLineLinkByAtlasUserId } from "@/lib/integrations/line/link-store";
import { isLineMessagingConfigured } from "@/lib/integrations/line/config";
import { externalServiceManager } from "@/lib/integrations/external-services/service";
import type { ExternalServiceId } from "@/lib/integrations/external-services/types";
import { isStripeConfigured } from "@/lib/billing/stripe/config";
import {
  getMemoriesForAssignment,
} from "@/lib/user-memory/service";
import {
  getWorkMemoriesForAssignment,
  isWorkMemoryEnabled,
} from "@/lib/work-memory/service";
import {
  isTaughtWorkflowData,
  parseTaughtSteps,
} from "@/lib/work-memory/taught-workflow";
import type { WorkMemoryRecord } from "@/lib/work-memory/types";

import {
  classifyCommanderWork,
  inferRequiredExternalServices,
} from "./classify";
import { selectRequiredAis } from "./select-ais";
import type {
  CommanderExecutionStep,
  CommanderExternalNeed,
  CommanderMemoryNeed,
  CommanderPlan,
  CommanderSelectedAi,
} from "./types";

export const COMMANDER_MAX_RETRIES = 2;

const EXTERNAL_SERVICE_IDS: readonly ExternalServiceId[] = [
  "google",
  "dropbox",
  "x",
  "wordpress",
  "youtube",
  "notion",
] as const;

function isExternalServiceId(value: string): value is ExternalServiceId {
  return (EXTERNAL_SERVICE_IDS as readonly string[]).includes(value);
}

function resolveExternalNeeds(
  userId: string | null,
  assignment: string,
  templateId: CommanderPlan["classification"]["templateId"],
): CommanderExternalNeed[] {
  const inferred = inferRequiredExternalServices(assignment, templateId);

  return inferred.map((need) => {
    if (need.serviceId === "line") {
      const linked =
        userId != null ? Boolean(getLineLinkByAtlasUserId(userId)) : false;
      return {
        ...need,
        connectionStatus: !isLineMessagingConfigured()
          ? ("unavailable" as const)
          : linked
            ? ("connected" as const)
            : ("disconnected" as const),
      };
    }

    if (need.serviceId === "stripe") {
      return {
        ...need,
        connectionStatus: isStripeConfigured()
          ? ("connected" as const)
          : ("disconnected" as const),
      };
    }

    if (!userId || !isExternalServiceId(need.serviceId)) {
      return {
        ...need,
        connectionStatus: "disconnected" as const,
      };
    }

    const connection = externalServiceManager.getConnection(
      userId,
      need.serviceId,
    );
    return {
      ...need,
      connectionStatus: connection.status,
    };
  });
}

function findTaughtWorkflow(
  memories: WorkMemoryRecord[],
): { title: string; stepLabels: string[] } | null {
  for (const memory of memories) {
    if (
      memory.type === "template" &&
      isTaughtWorkflowData(memory.structuredData)
    ) {
      const steps = parseTaughtSteps(memory.structuredData);
      if (steps.length === 0) continue;
      return {
        title: memory.title,
        stepLabels: steps.map((step) => step.title || step.id),
      };
    }
  }
  return null;
}

function resolveMemoryNeeds(
  userId: string | null,
  assignment: string,
): { memory: CommanderMemoryNeed; taught: { title: string; stepLabels: string[] } | null } {
  if (!userId) {
    return {
      memory: {
        workMemoryIds: [],
        workMemoryTitles: [],
        workMemoryTypes: [],
        learningKeys: [],
        summary: "未ログインのため記憶は利用しません",
      },
      taught: null,
    };
  }

  const workEnabled = isWorkMemoryEnabled(userId);
  const workMemories = workEnabled
    ? getWorkMemoriesForAssignment(userId, assignment)
    : [];
  const learning = getMemoriesForAssignment(userId, assignment);
  const taught = findTaughtWorkflow(workMemories);

  const learningKeys = learning.flatMap((memory) => {
    const keys: string[] = [memory.category];
    if (memory.learningKey) keys.push(memory.learningKey);
    return keys;
  });

  const parts: string[] = [];
  if (workMemories.length > 0) {
    parts.push(`仕事記憶 ${workMemories.length} 件`);
  }
  if (taught) {
    parts.push(`覚えた仕事「${taught.title}」`);
  }
  if (learning.length > 0) {
    parts.push(`学習設定 ${learning.length} 件`);
  }

  return {
    memory: {
      workMemoryIds: workMemories.map((memory) => memory.id),
      workMemoryTitles: workMemories.map((memory) => memory.title),
      workMemoryTypes: workMemories.map((memory) => memory.type),
      learningKeys,
      summary:
        parts.length > 0
          ? parts.join(" / ")
          : "関連する過去の記憶は見つかりませんでした",
    },
    taught,
  };
}

function buildExecutionOrder(
  ais: CommanderSelectedAi[],
  external: CommanderExternalNeed[],
): CommanderExecutionStep[] {
  const byPhase = (phase: CommanderSelectedAi["phase"]) =>
    ais.filter((ai) => ai.phase === phase).map((ai) => ai.employeeId);

  const steps: CommanderExecutionStep[] = [
    {
      stepId: "classify",
      label: "仕事分類",
      phase: "classify",
      parallelGroup: 0,
      employeeIds: [],
      dependsOn: [],
      parallel: false,
    },
    {
      stepId: "ceo",
      label: "CEO 方針決定",
      phase: "ceo",
      parallelGroup: 1,
      employeeIds: byPhase("ceo"),
      dependsOn: ["classify"],
      parallel: false,
    },
  ];

  const researchIds = byPhase("research");
  if (researchIds.length > 0) {
    steps.push({
      stepId: "research",
      label: "調査（並列可）",
      phase: "research",
      parallelGroup: 2,
      employeeIds: researchIds,
      dependsOn: ["ceo"],
      parallel: researchIds.length > 1,
    });
  }

  steps.push({
    stepId: "planner",
    label: "Planner 作業分解",
    phase: "planner",
    parallelGroup: 3,
    employeeIds: byPhase("planner"),
    dependsOn: researchIds.length > 0 ? ["research"] : ["ceo"],
    parallel: false,
  });

  const workerIds = byPhase("workers");
  steps.push({
    stepId: "workers",
    label: "担当AI 実行（並列）",
    phase: "workers",
    parallelGroup: 4,
    employeeIds: workerIds,
    dependsOn: ["planner"],
    parallel: workerIds.length > 1,
  });

  steps.push({
    stepId: "review",
    label: "品質確認",
    phase: "review",
    parallelGroup: 5,
    employeeIds: byPhase("review"),
    dependsOn: ["workers"],
    parallel: false,
  });

  const requiredExternal = external.filter((item) => item.required);
  if (requiredExternal.length > 0 || external.length > 0) {
    steps.push({
      stepId: "external",
      label: "外部サービス連携確認（並列）",
      phase: "external",
      parallelGroup: 6,
      employeeIds: [],
      dependsOn: ["review"],
      parallel: true,
    });
  }

  steps.push({
    stepId: "report",
    label: "完了報告",
    phase: "report",
    parallelGroup: 7,
    employeeIds: byPhase("ceo"),
    dependsOn: ["review", ...(external.length > 0 ? ["external"] : [])],
    parallel: false,
  });

  return steps;
}

export function buildCommanderPlan(input: {
  assignment: string;
  userId: string | null;
}): CommanderPlan {
  const classification = classifyCommanderWork(input.assignment);
  const requiredAis = selectRequiredAis({
    assignment: input.assignment,
    deliverableType: classification.deliverableType,
    keywords: classification.keywords,
  });
  const requiredExternalServices = resolveExternalNeeds(
    input.userId,
    input.assignment,
    classification.templateId,
  );
  const flow = createDefaultExecutionFlow(classification.templateId);
  const template = getWorkflowTemplate(classification.templateId);
  const { memory: requiredMemory, taught } = resolveMemoryNeeds(
    input.userId,
    input.assignment,
  );
  const requiredTemplate = {
    templateId: classification.templateId,
    label: taught ? `${template.label} / ${taught.title}` : template.label,
    stepIds: flow.steps.filter((step) => step.enabled).map((step) => step.id),
    stepLabels:
      taught && taught.stepLabels.length > 0
        ? taught.stepLabels
        : getEnabledStepLabels(flow),
    taughtWorkflowTitle: taught?.title ?? null,
  };

  return {
    assignment: input.assignment,
    classification,
    requiredAis,
    requiredExternalServices,
    requiredTemplate,
    requiredMemory,
    executionOrder: buildExecutionOrder(requiredAis, requiredExternalServices),
    maxRetries: COMMANDER_MAX_RETRIES,
    generatedAt: new Date().toISOString(),
  };
}
