import type { FirstSuccessKind } from "./types";

export type FirstSuccessEvidence = {
  kind: FirstSuccessKind;
  hasRealArtifact: boolean;
  sideEffectConfirmed: boolean;
  mock: boolean;
  sandbox: boolean;
  viewed: boolean;
};

export function isQualifyingFirstSuccess(evidence: FirstSuccessEvidence): boolean {
  if (evidence.mock || evidence.sandbox) return false;
  if (!evidence.hasRealArtifact && !evidence.sideEffectConfirmed) return false;

  switch (evidence.kind) {
    case "request_completed_viewed":
      return evidence.hasRealArtifact && evidence.viewed;
    case "artifact_opened":
      return evidence.hasRealArtifact && evidence.viewed;
    case "x_draft_reviewed":
      return evidence.hasRealArtifact && evidence.viewed;
    case "x_post_scheduled":
    case "x_post_published":
    case "calendar_live_succeeded":
      return evidence.sideEffectConfirmed;
    case "automation_run_succeeded":
      return evidence.sideEffectConfirmed && (evidence.hasRealArtifact || evidence.viewed);
    default:
      return false;
  }
}

export function requestCompletedIsActivation(input: {
  status: string;
  deliverableId?: string | null;
  artifactIds?: string[];
  viewed: boolean;
  mock?: boolean;
}): boolean {
  return isQualifyingFirstSuccess({
    kind: "request_completed_viewed",
    hasRealArtifact: Boolean(input.deliverableId || input.artifactIds?.length),
    sideEffectConfirmed: input.status === "completed" || input.status === "SUCCESS",
    mock: input.mock === true,
    sandbox: false,
    viewed: input.viewed,
  });
}
