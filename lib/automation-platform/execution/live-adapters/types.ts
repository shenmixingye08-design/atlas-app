/**
 * Live Adapter contracts — real integration calls only, never stub success.
 */

import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

// Note: this file must stay free of "server-only" so wired-status can import ids.

export type LiveAdapterId =
  | "atlas_deliverable_word"
  | "atlas_deliverable_excel"
  | "atlas_deliverable_pdf"
  | "atlas_deliverable_powerpoint"
  | "openai_vision"
  | "openai_vision_ocr"
  | "google_gmail"
  | "google_drive"
  | "google_calendar"
  | "dropbox"
  | "x"
  | "wordpress"
  | "line"
  | "slack"
  | "discord"
  | "notion";

export type LiveAdapterInvokeInput = {
  step: AutomationWorkflowStep;
  userId: string;
  automationName: string;
  runId: string;
  /** Prior deliverable artifact ids from this run (for upload/send) */
  priorArtifactIds?: string[];
};

export type LiveAdapterDefinition = {
  id: LiveAdapterId;
  serviceLabel: string;
  /** True only when a real production call path exists in this module. */
  wired: boolean;
  invoke: (input: LiveAdapterInvokeInput) => Promise<StepInvokeResult>;
};

export function adapterFailure(
  service: string,
  errorCode: string,
  errorMessage: string,
  opts?: { needsUserInput?: boolean; retryable?: boolean; failedStage?: string },
): StepInvokeResult {
  return {
    ok: false,
    summary: `${service}: ${errorMessage}`,
    artifacts: [],
    errorCode,
    errorMessage,
    failedStage: opts?.failedStage ?? "EXTERNAL_ADAPTER",
    retryable: opts?.retryable ?? false,
    needsUserInput: opts?.needsUserInput ?? false,
  };
}

export function adapterSuccess(input: {
  summary: string;
  externalId: string;
  url?: string | null;
  label?: string;
}): StepInvokeResult {
  const createdAt = new Date().toISOString();
  return {
    ok: true,
    summary: input.summary,
    artifacts: [
      {
        id: input.externalId,
        kind: "file",
        label: input.label ?? input.summary,
        url: input.url ?? null,
        externalId: input.externalId,
        createdAt,
      },
    ],
    evidence: {
      artifactIds: [input.externalId],
      storageObjectIds: [],
      externalActionIds: [input.externalId],
      externalUrls: input.url ? [input.url] : [],
      notificationIds: [],
    },
  };
}
