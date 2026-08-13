/**
 * Ensure Production external steps exist when NL / freeformNotes require them.
 *
 * Production evidence (diagnosticId aaef8557-500a-461f-a95a-d8df3e1905e4):
 * V2 run reached evaluateRunCompletion as succeeded with orchestrate-only
 * steps, then fail-closed at assertRequiredExternalStepsPresent because
 * google_calendar was required from instruction text but never generated
 * into workflow.steps (wizard/create path mapped draft.steps only).
 */

import {
  extractCalendarEventTitle,
  type RequiredExternalAction,
} from "@/lib/automations/detect-external-intent";
import {
  assertRequiredExternalStepsPresent,
  resolveRequiredExternals,
} from "@/lib/automations/required-external-fail-closed";
import {
  buildNotifyStepFromText,
  buildWordGenerateStepFromText,
  wantsPhase3GenerateStep,
  wantsPhase3NotifyStep,
} from "@/lib/automations/phase3-multistep-compose";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

function baseStep(
  partial: Pick<AutomationWorkflowStep, "id" | "type" | "name" | "order"> &
    Partial<AutomationWorkflowStep>,
): AutomationWorkflowStep {
  return {
    id: partial.id,
    type: partial.type,
    name: partial.name,
    order: partial.order,
    inputBindings: partial.inputBindings ?? {},
    configuration: partial.configuration ?? {},
    requiresApproval: partial.requiresApproval ?? true,
    retryPolicy: partial.retryPolicy ?? {
      maxAttempts: 3,
      backoffMs: [60_000, 300_000, 900_000],
    },
    timeoutMs: partial.timeoutMs ?? 120_000,
    onSuccess: null,
    onFailure: null,
    enabled: partial.enabled ?? true,
  };
}

/** Build a Production-wired Google Calendar create step from source text. */
export function buildGoogleCalendarStepFromText(
  sourceText: string,
  order = 0,
): AutomationWorkflowStep {
  const eventTitle =
    extractCalendarEventTitle(sourceText)?.trim() || "MINERVOT自動化テスト";
  return baseStep({
    id: "google_calendar",
    type: "google_calendar",
    name: "Google Calendar",
    order,
    requiresApproval: true,
    configuration: {
      eventTitle,
      action: "create",
      description: sourceText.slice(0, 200),
    },
  });
}

export function canWireProductionExternalStep(
  action: RequiredExternalAction,
): boolean {
  return action === "google_calendar";
}

/**
 * Append any missing Production external steps required by instruction text /
 * declared requiredExternals. Also stamps structuredOptions.requiredExternals.
 */
export function ensureRequiredExternalSteps(input: {
  steps: readonly AutomationWorkflowStep[];
  freeformNotes?: string | null;
  structuredOptions?: Record<string, unknown> | null;
  sourceText?: string | null;
}): {
  steps: AutomationWorkflowStep[];
  structuredOptions: Record<string, unknown>;
  required: RequiredExternalAction[];
  injected: RequiredExternalAction[];
  changed: boolean;
  unsupported: RequiredExternalAction[];
} {
  const sourceText =
    input.sourceText?.trim() ||
    input.freeformNotes?.trim() ||
    "";
  const declaredRaw = input.structuredOptions?.requiredExternals;
  const declared = Array.isArray(declaredRaw)
    ? (declaredRaw.filter(
        (item): item is RequiredExternalAction => typeof item === "string",
      ) as RequiredExternalAction[])
    : null;

  const required = resolveRequiredExternals({
    sourceText,
    declared,
  });

  const steps = input.steps.map((step) => ({ ...step }));
  const injected: RequiredExternalAction[] = [];
  const unsupported: RequiredExternalAction[] = [];

  // Phase 3: prepend generate when NL asks and missing.
  if (
    wantsPhase3GenerateStep(sourceText) &&
    !steps.some((step) => step.enabled && step.type === "word_generate")
  ) {
    steps.unshift(buildWordGenerateStepFromText(sourceText, 0));
  }

  for (const action of required) {
    const present = steps.some(
      (step) => step.enabled && step.type === action,
    );
    if (present) continue;
    if (!canWireProductionExternalStep(action)) {
      unsupported.push(action);
      continue;
    }
    if (action === "google_calendar") {
      const order =
        steps.reduce((max, step) => Math.max(max, step.order), 0) + 1;
      steps.push(buildGoogleCalendarStepFromText(sourceText, order));
      injected.push(action);
    }
  }

  const hasExternal = steps.some(
    (step) =>
      step.enabled &&
      (step.type === "google_calendar" ||
        step.type === "gmail" ||
        step.type === "dropbox" ||
        step.type === "x_post" ||
        step.type === "wordpress"),
  );
  if (
    (wantsPhase3NotifyStep(sourceText) ||
      (wantsPhase3GenerateStep(sourceText) && hasExternal)) &&
    !steps.some((step) => step.enabled && step.type === "notify")
  ) {
    const order =
      steps.reduce((max, step) => Math.max(max, step.order), 0) + 1;
    steps.push(buildNotifyStepFromText(sourceText, order));
  }

  // Normalize order after insertions.
  steps.sort((a, b) => a.order - b.order);
  for (let i = 0; i < steps.length; i += 1) {
    steps[i] = { ...steps[i]!, order: i };
  }

  // Drop lone orchestrate fallback when a real external step was injected —
  // orchestrate alone was the pre-#290 fake-success / post-#290 fail-closed shape.
  let nextSteps = steps;
  if (injected.length > 0 || wantsPhase3GenerateStep(sourceText)) {
    const withoutOrphanOrchestrate = steps.filter(
      (step) => !(step.type === "orchestrate" && step.enabled),
    );
    if (
      withoutOrphanOrchestrate.some(
        (step) => step.enabled && step.type !== "orchestrate",
      )
    ) {
      nextSteps = withoutOrphanOrchestrate.map((step, index) => ({
        ...step,
        order: index,
      }));
    }
  }

  const structuredOptions: Record<string, unknown> = {
    ...(input.structuredOptions ?? {}),
  };
  if (required.length > 0) {
    structuredOptions.requiredExternals = [...required];
  }

  const changed =
    injected.length > 0 ||
    JSON.stringify(structuredOptions.requiredExternals ?? null) !==
      JSON.stringify(declaredRaw ?? null) ||
    nextSteps.length !== input.steps.length ||
    nextSteps.some((step, index) => step.id !== input.steps[index]?.id);

  return {
    steps: nextSteps,
    structuredOptions,
    required,
    injected,
    changed,
    unsupported,
  };
}

/** Fail-closed helper after ensure — still missing / unwired → not activatable. */
export function assertExternalsSatisfiedBySteps(input: {
  required: readonly RequiredExternalAction[];
  steps: readonly AutomationWorkflowStep[];
}): ReturnType<typeof assertRequiredExternalStepsPresent> {
  return assertRequiredExternalStepsPresent({
    required: input.required,
    enabledStepTypes: input.steps
      .filter((step) => step.enabled)
      .map((step) => step.type),
  });
}
