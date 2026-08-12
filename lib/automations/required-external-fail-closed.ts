/**
 * Fail-closed gates for required external actions.
 * Production evidence (2026-08-13 JST): Calendar NL automation completed as
 * "本日成功" while Google Calendar had no event — V1 orchestrate without
 * a Production Calendar step / provider event ID.
 */

import {
  describeMissingExternalAction,
  detectRequiredExternalActions,
  type RequiredExternalAction,
} from "@/lib/automations/detect-external-intent";

export type RequiredExternalSatisfaction = {
  ok: true;
} | {
  ok: false;
  missing: RequiredExternalAction[];
  reason: string;
  code:
    | "external_step_missing"
    | "adapter_not_executed"
    | "provider_evidence_missing";
};

/** Declared required externals from NL / instruction metadata. */
export function resolveRequiredExternals(input: {
  sourceText?: string | null;
  declared?: readonly RequiredExternalAction[] | null;
}): RequiredExternalAction[] {
  if (input.declared && input.declared.length > 0) {
    return [...input.declared];
  }
  if (input.sourceText?.trim()) {
    return detectRequiredExternalActions(input.sourceText);
  }
  return [];
}

/**
 * Create-time / definition-time: required external must appear as an enabled step.
 */
export function assertRequiredExternalStepsPresent(input: {
  required: readonly RequiredExternalAction[];
  enabledStepTypes: readonly string[];
}): RequiredExternalSatisfaction {
  if (input.required.length === 0) return { ok: true };
  const missing = input.required.filter(
    (action) => !input.enabledStepTypes.includes(action),
  );
  if (missing.length === 0) return { ok: true };
  return {
    ok: false,
    missing,
    code: "external_step_missing",
    reason: `必須の外部手順が未生成のため完了できません: ${missing
      .map(describeMissingExternalAction)
      .join("、")}`,
  };
}

/**
 * Run-time: required external must have provider evidence (event/message IDs).
 * Missing step, missing adapter execution, or missing provider ID → not success.
 */
export function assertRequiredExternalEvidence(input: {
  required: readonly RequiredExternalAction[];
  enabledStepTypes: readonly string[];
  executedStepTypes?: readonly string[];
  externalActionIds?: readonly string[] | null;
  providerEventIds?: readonly string[] | null;
}): RequiredExternalSatisfaction {
  if (input.required.length === 0) return { ok: true };

  const steps = assertRequiredExternalStepsPresent({
    required: input.required,
    enabledStepTypes: input.enabledStepTypes,
  });
  if (!steps.ok) return steps;

  if (input.executedStepTypes) {
    const notExecuted = input.required.filter(
      (action) => !input.executedStepTypes!.includes(action),
    );
    if (notExecuted.length > 0) {
      return {
        ok: false,
        missing: notExecuted,
        code: "adapter_not_executed",
        reason: `必須の外部アダプタが未実行のため成功にできません: ${notExecuted
          .map(describeMissingExternalAction)
          .join("、")}`,
      };
    }
  }

  const ids = [
    ...(input.externalActionIds ?? []),
    ...(input.providerEventIds ?? []),
  ].filter((id) => typeof id === "string" && id.trim().length > 0);

  if (ids.length === 0) {
    return {
      ok: false,
      missing: [...input.required],
      code: "provider_evidence_missing",
      reason:
        "外部プロバイダのリソースID（例: Google Calendar event ID）がないため成功にできません",
    };
  }

  return { ok: true };
}

/** V1 orchestrate path cannot satisfy Calendar (etc.) — always fail-closed. */
export function v1CannotSatisfyRequiredExternals(
  sourceText: string,
): RequiredExternalSatisfaction {
  const required = detectRequiredExternalActions(sourceText);
  if (required.length === 0) return { ok: true };
  return {
    ok: false,
    missing: required,
    code: "external_step_missing",
    reason: `V1実行経路では必須の外部操作（${required
      .map(describeMissingExternalAction)
      .join("、")}）を実行できません。成功扱いにはしません。`,
  };
}
