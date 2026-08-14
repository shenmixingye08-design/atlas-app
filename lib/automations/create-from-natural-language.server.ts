import "server-only";

import {
  requireBillingAutomationTask,
  requireBillingFeature,
} from "@/lib/billing/access";
import { validateAutomationFeatureAccess } from "@/lib/feature-flags/guards";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { createExternalAutomationV2FromNaturalLanguage } from "@/lib/automations/create-external-v2-from-nl";
import { createConditionAutomationV2FromNaturalLanguage } from "@/lib/automations/create-condition-v2-from-nl";
import {
  isConditionTriggerNaturalLanguage,
  parsePhase4ConditionNaturalLanguage,
} from "@/lib/automations/phase4-condition-compose";

import { automationService } from "./automation-service";
import {
  parseNaturalLanguageAutomation,
  shouldRouteNlToV2ExternalCreate,
} from "./create-from-natural-language";
import type { Automation } from "./types";

export type CreateFromNaturalLanguageResult =
  | {
      ok: true;
      automation: Automation;
      message: string;
      frequency: "daily" | "weekly" | "monthly" | "condition";
      triggerKind?: "schedule" | "condition";
      /** Present when Production external steps were created on Automation V2. */
      automationV2Id?: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      httpStatus: number;
    };

/**
 * Map a V2 definition into the Phase 1 Automation shape for API / Commander UX.
 * Execution of required externals is owned by V2 — never by V1 orchestrate.
 */
function mapV2ToPhase1AutomationResponse(input: {
  userId: string;
  v2: {
    id: string;
    name: string;
    description: string;
    nextRunAt: string | null;
    createdAt: string;
    updatedAt: string;
    status: string;
  };
  createInput: import("./types").CreateAutomationInput;
  executionLevel: string;
  requiredExternals?: string[];
}): Automation {
  const schedule = input.createInput.schedule;
  return {
    id: input.v2.id,
    userId: input.userId,
    name: input.v2.name,
    description: input.v2.description,
    schedule,
    workflow: {
      ...input.createInput.workflow,
      metadata: {
        ...(input.createInput.workflow.metadata ?? {}),
        automationV2Id: input.v2.id,
        source: "natural_language_external",
        requiredExternals:
          input.requiredExternals ?? ["google_calendar"],
      },
    },
    timing: input.createInput.timing ?? {
      startDate: null,
      endCondition: { type: "never" },
    },
    executionLevel:
      (input.createInput.executionLevel as Automation["executionLevel"]) ??
      "approve_then_run",
    executionMode: input.createInput.executionMode ?? "standard",
    snsBatchDays: input.createInput.snsBatchDays ?? null,
    executionFlow: input.createInput.executionFlow ?? {
      templateId: "generic",
      steps: [],
    },
    destination: "none",
    enabled: true,
    lastRun: null,
    nextRun: input.v2.nextRunAt,
    status: input.v2.status === "active" ? "idle" : "idle",
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: input.v2.createdAt,
    updatedAt: input.v2.updatedAt,
  };
}

async function createExternalPath(input: {
  userId: string;
  text: string;
  parsed: Extract<
    ReturnType<typeof parseNaturalLanguageAutomation>,
    { ok: true }
  >;
}): Promise<CreateFromNaturalLanguageResult> {
  const accessContext = await resolveFeatureAccessContext();
  const existing = await automationService.listForUser(input.userId);
  const taskDenied = await requireBillingAutomationTask(
    input.userId,
    existing.length,
  );
  if (taskDenied) {
    const body = (await taskDenied.json().catch(() => ({}))) as {
      error?: string;
    };
    return {
      ok: false,
      code: "billing_task_limit",
      message: body.error ?? "自動化の作成上限に達しています。",
      httpStatus: taskDenied.status,
    };
  }

  const created = await createExternalAutomationV2FromNaturalLanguage({
    userId: input.userId,
    createInput: input.parsed.createInput,
    sourceText: input.parsed.sourceText,
    requiredExternals: input.parsed.requiredExternals,
    context: accessContext,
  });

  if (!created.ok) {
    return {
      ok: false,
      code: created.code,
      message: created.message,
      httpStatus: created.httpStatus,
    };
  }

  const v2 = created.automation;
  if (!v2.nextRunAt) {
    return {
      ok: false,
      code: "next_run_missing",
      message: "次回実行時刻が生成されていません。成功扱いにはしません。",
      httpStatus: 500,
    };
  }

  const hasCalendar = v2.workflow.steps.some(
    (step) => step.enabled && step.type === "google_calendar",
  );
  if (!hasCalendar) {
    return {
      ok: false,
      code: "external_step_missing",
      message:
        "Calendar手順が保存されませんでした。成功扱いにはしません。",
      httpStatus: 500,
    };
  }

  // Phase 3: when NL asks for generate+notify, refuse incomplete compositions.
  const { wantsPhase3GenerateStep, wantsPhase3NotifyStep } = await import(
    "@/lib/automations/phase3-multistep-compose"
  );
  if (wantsPhase3GenerateStep(input.parsed.sourceText)) {
    const hasGenerate = v2.workflow.steps.some(
      (step) => step.enabled && step.type === "word_generate",
    );
    if (!hasGenerate) {
      return {
        ok: false,
        code: "phase3_generate_step_missing",
        message:
          "文章生成手順が保存されませんでした。成功扱いにはしません。",
        httpStatus: 500,
      };
    }
  }
  if (
    wantsPhase3NotifyStep(input.parsed.sourceText) ||
    wantsPhase3GenerateStep(input.parsed.sourceText)
  ) {
    const hasNotify = v2.workflow.steps.some(
      (step) => step.enabled && step.type === "notify",
    );
    if (!hasNotify) {
      return {
        ok: false,
        code: "phase3_notify_step_missing",
        message: "完了通知手順が保存されませんでした。成功扱いにはしません。",
        httpStatus: 500,
      };
    }
  }

  const automation = mapV2ToPhase1AutomationResponse({
    userId: input.userId,
    v2,
    createInput: input.parsed.createInput,
    executionLevel: "approve_then_run",
    requiredExternals: input.parsed.requiredExternals,
  });

  const { formatRegistrationSuccess } = await import("@/lib/automations/ux");

  return {
    ok: true,
    automation,
    automationV2Id: v2.id,
    frequency: input.parsed.frequency,
    message: formatRegistrationSuccess(automation),
  };
}

function mapV2ConditionToPhase1AutomationResponse(input: {
  userId: string;
  v2: {
    id: string;
    name: string;
    description: string;
    nextRunAt: string | null;
    createdAt: string;
    updatedAt: string;
    status: string;
    trigger: {
      type: string;
      condition: { expression: string } | null;
      event: {
        source: string;
        eventType: string;
        filter?: Readonly<Record<string, unknown>>;
      } | null;
    };
  };
  title: string;
  sourceText: string;
}): Automation {
  return {
    id: input.v2.id,
    userId: input.userId,
    name: input.v2.name,
    description: input.v2.description,
    schedule: {
      kind: "calendar",
      label: `条件: カレンダー「${input.title}」検出時`,
      config: {
        triggerType: "condition",
        expression: input.v2.trigger.condition?.expression ?? null,
        provider: input.v2.trigger.event?.source ?? "google_calendar",
        title: input.title,
        sourceText: input.sourceText,
      },
    },
    workflow: {
      assignment: input.sourceText,
      metadata: {
        automationV2Id: input.v2.id,
        source: "natural_language_condition",
        requiredExternals: [],
      },
    },
    timing: {
      startDate: null,
      endCondition: { type: "never" },
    },
    executionLevel: "full_auto",
    executionMode: "standard",
    snsBatchDays: null,
    executionFlow: {
      templateId: "generic",
      steps: [],
    },
    destination: "none",
    enabled: true,
    lastRun: null,
    nextRun: null,
    status: "idle",
    lastWorkflowRunId: null,
    lastError: null,
    successCount: 0,
    failureCount: 0,
    runHistory: [],
    createdAt: input.v2.createdAt,
    updatedAt: input.v2.updatedAt,
  };
}

async function createConditionPath(input: {
  userId: string;
  text: string;
}): Promise<CreateFromNaturalLanguageResult> {
  const accessContext = await resolveFeatureAccessContext();
  const existing = await automationService.listForUser(input.userId);
  const taskDenied = await requireBillingAutomationTask(
    input.userId,
    existing.length,
  );
  if (taskDenied) {
    const body = (await taskDenied.json().catch(() => ({}))) as {
      error?: string;
    };
    return {
      ok: false,
      code: "billing_task_limit",
      message: body.error ?? "自動化の作成上限に達しています。",
      httpStatus: taskDenied.status,
    };
  }

  const created = await createConditionAutomationV2FromNaturalLanguage({
    userId: input.userId,
    text: input.text,
    context: accessContext,
  });
  if (!created.ok) {
    return {
      ok: false,
      code: created.code,
      message: created.message,
      httpStatus: created.httpStatus,
    };
  }

  const parsed = parsePhase4ConditionNaturalLanguage(input.text);
  const title = parsed.ok ? parsed.title : created.title;
  const automation = mapV2ConditionToPhase1AutomationResponse({
    userId: input.userId,
    v2: created.automation,
    title,
    sourceText: input.text,
  });

  return {
    ok: true,
    automation,
    automationV2Id: created.automation.id,
    frequency: "condition",
    triggerKind: "condition",
    message: [
      `条件の仕事「${automation.name}」を自動化しました。`,
      `カレンダーに「${title}」が見つかったときに実行します。`,
      "実行方法：実行前に確認",
    ].join("\n"),
  };
}

/**
 * Fail-closed NL → durable active automation.
 * External Calendar (etc.) → V2 Production steps only (no V1 orchestrate fake-success).
 * Success only when persisted, enabled, schedule kind=schedule, and nextRun set.
 * Phase 4: condition/event NL is handled before schedule parsing.
 */
export async function createAutomationFromNaturalLanguage(input: {
  userId: string;
  text: string;
}): Promise<CreateFromNaturalLanguageResult> {
  // Phase 4 first — never mix condition NL into Phase 1 schedule create.
  if (isConditionTriggerNaturalLanguage(input.text)) {
    return createConditionPath(input);
  }

  const parsed = parseNaturalLanguageAutomation(input.text);
  if (!parsed.ok) {
    return {
      ok: false,
      code: parsed.code,
      message: parsed.message,
      httpStatus: 400,
    };
  }

  // Production evidence (2026-08-13): Calendar NL that only created V1 orchestrate
  // completed as "本日成功" with zero Google Calendar events. Route externals to V2.
  // X-only stays on V1 destination=x SoT — V2 cannot wire x_post.
  if (shouldRouteNlToV2ExternalCreate(parsed.requiredExternals)) {
    return createExternalPath({
      userId: input.userId,
      text: input.text,
      parsed,
    });
  }

  let createInput = parsed.createInput;
  const accessContext = await resolveFeatureAccessContext();
  const featureError = validateAutomationFeatureAccess(
    createInput,
    accessContext,
  );
  if (featureError) {
    return {
      ok: false,
      code: "feature_denied",
      message: featureError,
      httpStatus: 403,
    };
  }

  const existing = await automationService.listForUser(input.userId);
  const taskDenied = await requireBillingAutomationTask(
    input.userId,
    existing.length,
  );
  if (taskDenied) {
    const body = (await taskDenied.json().catch(() => ({}))) as {
      error?: string;
    };
    return {
      ok: false,
      code: "billing_task_limit",
      message: body.error ?? "自動化の作成上限に達しています。",
      httpStatus: taskDenied.status,
    };
  }

  if (createInput.executionMode === "high_quality") {
    const hqDenied = await requireBillingFeature(
      input.userId,
      "high_quality_mode",
    );
    if (hqDenied) {
      const body = (await hqDenied.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        ok: false,
        code: "billing_hq",
        message: body.error ?? "高品質モードを利用できません。",
        httpStatus: hqDenied.status,
      };
    }
  }
  if (createInput.executionMode === "eco") {
    const ecoDenied = await requireBillingFeature(input.userId, "eco_mode");
    if (ecoDenied) {
      const body = (await ecoDenied.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        ok: false,
        code: "billing_eco",
        message: body.error ?? "エコモードを利用できません。",
        httpStatus: ecoDenied.status,
      };
    }
  }

  try {
    const { applyMemoryToAutomationCreate } = await import(
      "@/lib/memory-apply/automation-create-apply"
    );
    const applied = await applyMemoryToAutomationCreate({
      userId: input.userId,
      text: input.text,
      createInput,
    });
    createInput = applied.createInput;
  } catch {
    // Memory unavailable — continue with automation defaults (fail-open).
  }

  const destination = createInput.destination === "x" ? "x" : "none";
  if (destination === "x") {
    const snsDenied = await requireBillingFeature(input.userId, "sns_auto_post");
    if (snsDenied) {
      const body = (await snsDenied.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        ok: false,
        code: "billing_sns",
        message: body.error ?? "SNS自動投稿を利用できません。",
        httpStatus: snsDenied.status,
      };
    }
    const { gateXRecurringConnection } = await import(
      "./x-recurring/connection-gate"
    );
    const gate = await gateXRecurringConnection({
      userId: input.userId,
      context: accessContext,
    });
    if (!gate.ok) {
      return {
        ok: false,
        code: gate.error.code,
        message: gate.error.message,
        httpStatus: 400,
      };
    }
    const { buildXDestinationExecutionFlow } = await import(
      "./x-recurring/destination"
    );
    createInput.destination = "x";
    createInput.executionFlow = buildXDestinationExecutionFlow(
      createInput.executionLevel ?? "approve_then_run",
    );
  }

  let automation: Automation;
  try {
    automation = await automationService.createForUser(
      input.userId,
      createInput,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 200) : "create_failed";
    return {
      ok: false,
      code: "create_failed",
      message: `自動化の登録に失敗しました（${message}）。成功扱いにはしません。`,
      httpStatus: 500,
    };
  }

  // Fail-closed: never claim success without durable schedule + nextRun.
  if (!automation.enabled) {
    return {
      ok: false,
      code: "not_active",
      message: "自動化は作成されましたが有効化されていません。",
      httpStatus: 500,
    };
  }
  if (automation.schedule.kind !== "schedule") {
    return {
      ok: false,
      code: "schedule_missing",
      message: "スケジュールが保存されていません。",
      httpStatus: 500,
    };
  }
  if (!automation.nextRun) {
    return {
      ok: false,
      code: "next_run_missing",
      message: "次回実行時刻が生成されていません。",
      httpStatus: 500,
    };
  }

  // Re-read to confirm hydration/persistence path sees the same record.
  const stored = await automationService.getByIdForUser(
    automation.id,
    input.userId,
  );
  if (!stored?.enabled || !stored.nextRun || stored.schedule.kind !== "schedule") {
    return {
      ok: false,
      code: "persist_verify_failed",
      message: "永続化の確認に失敗しました。成功扱いにはしません。",
      httpStatus: 500,
    };
  }

  const { formatRegistrationSuccess } = await import("@/lib/automations/ux");

  return {
    ok: true,
    automation: stored,
    frequency: parsed.frequency,
    message: formatRegistrationSuccess(stored),
  };
}

/** True when this automation is eligible for Minute Scheduler due scan. */
export function isSchedulerDueEligible(automation: Automation): boolean {
  return (
    automation.enabled === true &&
    automation.schedule.kind === "schedule" &&
    typeof automation.nextRun === "string" &&
    automation.nextRun.length > 0
  );
}
