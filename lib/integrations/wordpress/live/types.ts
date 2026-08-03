/**
 * WordPress Production Live Adapter — typed contracts.
 */

export const WORDPRESS_ADAPTER_MODE = "production" as const;
export const WORDPRESS_SERVICE_ID = "wordpress" as const;

export const WORDPRESS_ACTIONS = ["draft", "publish", "update"] as const;

export type WordPressLiveAction = (typeof WORDPRESS_ACTIONS)[number];

export const WORDPRESS_CONNECTION_HEALTH = [
  "connected",
  "reconnect_required",
  "disabled",
  "error",
  "disconnected",
  "invalid",
  "auth_failure",
] as const;

export type WordPressConnectionHealth =
  (typeof WORDPRESS_CONNECTION_HEALTH)[number];

export type WordPressStepInput = {
  action: WordPressLiveAction;
  title: string;
  content: string;
  excerpt: string | null;
  categories: number[];
  tags: number[];
  postId: number | null;
  featuredMediaArtifactId: string | null;
  featuredImageAlt: string | null;
  approvalRequired: boolean;
  idempotencyKey: string;
  ownerId: string;
  organizationId: string | null;
  runId: string;
  stepId: string;
  diagnosticId: string;
  siteUrl: string;
};

export type WordPressExternalAction = {
  externalActionId: string;
  service: typeof WORDPRESS_SERVICE_ID;
  action: WordPressLiveAction;
  postId: number;
  postStatus: string;
  link: string;
  editLink: string;
  titleHash: string;
  contentHash: string;
  mediaArtifactIds: string[];
  mediaIds: number[];
  status: "verified" | "awaiting_approval";
  adapterMode: typeof WORDPRESS_ADAPTER_MODE;
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
};

export type WordPressAdapterResult =
  | {
      ok: true;
      action: WordPressExternalAction;
      awaitingApproval: boolean;
      title: string;
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      retryable: boolean;
      connectionHealth?: WordPressConnectionHealth;
      needsUserInput?: boolean;
      retryCount: number;
      partialAction?: WordPressExternalAction | null;
    };

export type WordPressRetryHistoryEntry = {
  attempt: number;
  at: string;
  errorCode: string;
  errorMessage: string;
  httpStatus?: number;
  retryAfterMs?: number;
};

export type WordPressAdapterMetricsSnapshot = {
  draftCount: number;
  publishCount: number;
  updateCount: number;
  successRate: number;
  failureRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  retryRate: number;
  duplicatePreventedCount: number;
  approvalWaitCount: number;
  mediaFailureCount: number;
  verificationFailureCount: number;
  latenciesMs: number[];
};
