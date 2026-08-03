/**
 * Shared types for integration verification / retry helpers.
 * Live Adapter Registry (`lib/live-adapters`) is the execution SoT.
 */

export type RetryClassification =
  | "retryable_429"
  | "retryable_5xx"
  | "retryable_timeout"
  | "retryable_network"
  | "non_retryable_4xx"
  | "non_retryable_other";

export type PostVerification = {
  posted: boolean;
  externalId: string | null;
  externalUrl: string | null;
  publicStatus: string | null;
  fetchVerified: boolean;
};

export type UploadVerification = {
  uploaded: boolean;
  externalId: string | null;
  externalUrl: string | null;
  checksumSha256: string | null;
  downloadVerified: boolean;
  metadataMatched: boolean;
  byteLengthMatched: boolean;
};

export type IntegrationServiceId =
  | "google_drive"
  | "gmail"
  | "google_calendar"
  | "dropbox"
  | "wordpress"
  | "x"
  | "line"
  | "slack"
  | "discord"
  | "notion"
  | "webhook";

export type IntegrationExecutionProof = {
  serviceId: IntegrationServiceId;
  ok: boolean;
  verified: boolean;
  externalId: string | null;
  externalUrl: string | null;
  proofKind: "live" | "mock" | "duplicate";
};

export type CompletionGateInput = {
  artifactReady: boolean;
  requiredServices: IntegrationServiceId[];
  results: IntegrationExecutionProof[];
};

export type CompletionGateResult = {
  canComplete: boolean;
  reason: string | null;
  proofs: Array<{
    serviceId: IntegrationServiceId;
    externalId: string;
    externalUrl: string;
  }>;
};
