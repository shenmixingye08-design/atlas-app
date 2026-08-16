/**
 * Production external adapters for Automation V2 steps.
 * Never return success without a real provider resource id.
 */

import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";
import type { ResolvedInstruction } from "@/lib/automation-platform/types/instruction";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

export type ExternalAdapterInput = {
  step: AutomationWorkflowStep;
  userId: string;
  automationName: string;
  automationId: string | null;
  runId: string;
  /** Stable side-effect occurrence across safe-retry run ids. */
  occurrenceKey?: string | null;
  approved: boolean;
  priorArtifacts?: Array<{
    id: string;
    label: string;
    url: string | null;
    externalId: string | null;
    kind?: string;
  }>;
  resolvedInstruction?: ResolvedInstruction | null;
  generatedXPostText?: string | null;
  freeformNotes?: string | null;
};

export type ExternalAdapter = (
  input: ExternalAdapterInput,
) => Promise<StepInvokeResult>;

export type WiredExternalAdapterId =
  | "google_gmail"
  | "google_calendar"
  | "x"
  | "wordpress"
  | "dropbox";

export const WIRED_EXTERNAL_ADAPTER_IDS: readonly WiredExternalAdapterId[] = [
  "google_gmail",
  "google_calendar",
  "x",
  "wordpress",
  "dropbox",
] as const;
