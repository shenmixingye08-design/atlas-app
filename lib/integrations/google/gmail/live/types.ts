/**
 * Gmail Production Live Adapter — typed contracts.
 */

export const GMAIL_ADAPTER_MODE = "production" as const;
export const GMAIL_SERVICE_ID = "gmail" as const;

export const GMAIL_ACTIONS = [
  "draft",
  "send",
  "send_draft",
  "reply",
] as const;

export type GmailLiveAction = (typeof GMAIL_ACTIONS)[number];

export const GMAIL_CONNECTION_HEALTH = [
  "connected",
  "expired",
  "revoked",
  "missing_scope",
  "reconnect_required",
  "disabled",
  "error",
  "disconnected",
  "invalid",
] as const;

export type GmailConnectionHealth = (typeof GMAIL_CONNECTION_HEALTH)[number];

export type GmailResolvedRecipients = {
  to: string[];
  cc: string[];
  bcc: string[];
  warnings: string[];
};

export type GmailAttachmentRef = {
  artifactId: string;
  fileName: string;
  mimeType: string;
  size: number;
  checksum: string;
};

export type GmailStepInput = {
  action: GmailLiveAction;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  textBody: string;
  htmlBody: string | null;
  attachmentArtifactIds: string[];
  replyToMessageId: string | null;
  threadId: string | null;
  inReplyTo: string | null;
  references: string | null;
  signatureProfileId: string | null;
  approvalRequired: boolean;
  idempotencyKey: string;
  ownerId: string;
  organizationId: string | null;
  runId: string;
  stepId: string;
  diagnosticId: string;
  draftId: string | null;
};

export type GmailExternalAction = {
  externalActionId: string;
  service: typeof GMAIL_SERVICE_ID;
  action: GmailLiveAction;
  draftId: string | null;
  messageId: string | null;
  threadId: string | null;
  recipientHash: string;
  subjectHash: string;
  bodyHash: string;
  attachmentHash: string;
  attachmentIds: string[];
  attachmentCount: number;
  status: "verified" | "awaiting_approval";
  adapterMode: typeof GMAIL_ADAPTER_MODE;
  environment: string;
  diagnosticId: string;
  startedAt: string;
  completedAt: string;
  retryCount: number;
  idempotencyKey: string;
  providerRequestId: string | null;
  resultHash: string;
  duplicatePrevented: boolean;
  approvalId: string | null;
  deliveryGuarantee: "provider_accepted" | "not_applicable";
};

export type GmailAdapterResult =
  | {
      ok: true;
      action: GmailExternalAction;
      awaitingApproval: boolean;
      recipients: GmailResolvedRecipients;
      subject: string;
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      retryable: boolean;
      connectionHealth?: GmailConnectionHealth;
      needsUserInput?: boolean;
      retryCount: number;
      partialDraft?: GmailExternalAction | null;
    };

export type GmailRetryHistoryEntry = {
  attempt: number;
  at: string;
  errorCode: string;
  errorMessage: string;
  httpStatus?: number;
  retryAfterMs?: number;
};

export type GmailAdapterMetricsSnapshot = {
  draftCount: number;
  sendCount: number;
  successRate: number;
  failureRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  retryRate: number;
  tokenRefreshRate: number;
  duplicatePreventedCount: number;
  approvalWaitCount: number;
  invalidRecipientCount: number;
  attachmentFailureCount: number;
  scopeErrorCount: number;
  verificationFailureCount: number;
  latenciesMs: number[];
};
