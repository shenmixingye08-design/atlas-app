/**
 * Step invoker contracts for V2 Automation.
 *
 * Production must never use stub/mock/placeholder success.
 * `defaultStepInvoker` is fail-closed for every step type.
 */

import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type {
  AutomationRunArtifact,
  MemoryUsageRecord,
} from "@/lib/automation-platform/types/run";
import type { ResolvedInstruction } from "@/lib/automation-platform/types/instruction";
import type { StepEvidenceFragment } from "@/lib/automation-platform/execution/completion-evidence-v2";

export type StepInvokeResult = {
  ok: boolean;
  summary: string;
  artifacts: AutomationRunArtifact[];
  errorCode?: string | null;
  errorMessage?: string | null;
  needsUserInput?: boolean;
  failedStage?: string | null;
  retryable?: boolean;
  evidence?: StepEvidenceFragment;
};

export type StepInvoker = (input: {
  step: AutomationWorkflowStep;
  userId: string;
  automationName: string;
  runId: string;
  /** Durable automation id — used for side-effect idempotency. */
  automationId?: string | null;
  /**
   * Stable occurrence key for side-effect claims across safe-retry run ids.
   * Prefer scheduleOccurrenceKey / runKey over raw runId.
   */
  occurrenceKey?: string | null;
  approved: boolean;
  /** Artifacts produced by earlier succeeded steps in this run. */
  priorArtifacts?: AutomationRunArtifact[];
  /** Optional Memory / instruction context for production step adapters. */
  resolvedInstruction?: ResolvedInstruction | null;
  memoryUsage?: MemoryUsageRecord | null;
  generatedXPostText?: string | null;
  freeformNotes?: string | null;
}) => Promise<StepInvokeResult>;

/**
 * Fail-closed default — never returns success for unimplemented / unregistered steps.
 * Kept for explicit test injection of the closed gate; Production dispatch uses
 * `strictStepInvoker` instead.
 */
export const defaultStepInvoker: StepInvoker = async (input) => {
  return {
    ok: false,
    summary: "未実装の手順です",
    artifacts: [],
    errorCode: "step_not_implemented",
    errorMessage: `step_not_implemented:${input.step.type}`,
    failedStage: "STEP_DISPATCH",
    retryable: false,
  };
};
