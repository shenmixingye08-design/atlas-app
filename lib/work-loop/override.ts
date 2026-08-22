/**
 * Current-request override must not mutate the standing Work executionLevel.
 */

import type { AutomationExecutionLevel } from "@/lib/automations/types";

import { mayAutoSend } from "./delegation";
import type { WorkKind } from "./kinds";

export type CurrentOverride = "none" | "confirm_first" | "draft_only" | "send_now";

export function detectCurrentOverride(text: string): CurrentOverride {
  const trimmed = text.trim();
  if (!trimmed) return "none";
  if (/今回は下書き|下書きだけ|送らないで|送信しない/.test(trimmed)) return "draft_only";
  if (/今回は送って|今回送信|送っておいて/.test(trimmed)) return "send_now";
  if (/今回は確認|確認してから|承認してから/.test(trimmed)) return "confirm_first";
  return "none";
}

export function resolveEffectiveDelegation(input: {
  standing: AutomationExecutionLevel;
  currentText?: string;
  kind: WorkKind;
}): {
  standing: AutomationExecutionLevel;
  effective: AutomationExecutionLevel;
  maySend: boolean;
  standingUnchanged: true;
} {
  const override = detectCurrentOverride(input.currentText ?? "");
  let effective = input.standing;

  if (override === "draft_only") {
    effective = "draft_save";
  } else if (override === "confirm_first") {
    effective = input.standing === "suggest_only" ? "suggest_only" : "approve_then_run";
  } else if (override === "send_now") {
    // Honor explicit send intent, but keep the standing confirmation contract
    // unless the Work already allows full_auto send.
    effective = input.standing === "full_auto" ? "full_auto" : "approve_then_run";
  }

  const maySend =
    override === "draft_only"
      ? false
      : mayAutoSend({ executionLevel: effective, kind: input.kind });

  return {
    standing: input.standing,
    effective,
    maySend,
    standingUnchanged: true,
  };
}
