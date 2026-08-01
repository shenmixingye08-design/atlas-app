export const DEFAULT_RELEASE_BLOCKER_OUT =
  process.env.RELEASE_BLOCKER_OUT?.trim() ||
  "/opt/cursor/artifacts/release-blocker";

export type FindingSeverity = "Critical" | "High" | "Medium" | "Low";

export type ReleaseFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  area: string;
  evidence: string;
  status: "open" | "fixed" | "mitigated" | "accepted_risk";
  blocksRelease: boolean;
  remediation?: string;
};

export type PermissionCaseResult = {
  caseId: string;
  scenario: string;
  okDenied: boolean;
  detail: string;
  requestId: string;
};

export type ReleaseBlockerAggregate = {
  permissionCases: number;
  permissionDeniedRate: number;
  findings: ReleaseFinding[];
  criticalOpen: number;
  highOpen: number;
  mediumOpen: number;
  lowOpen: number;
  authzFixed: boolean;
  billingGated: boolean;
  productionE2eVerified: boolean;
  releaseReady: boolean;
  releaseReadyReasons: string[];
};
