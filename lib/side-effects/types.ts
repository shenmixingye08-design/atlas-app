/** P1-04 durable side-effect claim statuses. */
export type SideEffectStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "unknown_outcome";

export type SideEffectProvider =
  | "x"
  | "gmail"
  | "notification"
  | "google_calendar"
  | "drive"
  | "dropbox"
  | "wordpress"
  | "storage"
  | "other";

export type SideEffectActionType =
  | "post"
  | "send"
  | "notify"
  | "create_event"
  | "upload"
  | "publish"
  | "external";

export type SideEffectContext = {
  userId: string;
  provider: SideEffectProvider;
  actionType: SideEffectActionType;
  /** Stable destination fingerprint (email to, calendar id, path, channel…). */
  destination: string;
  automationId?: string | null;
  runId?: string | null;
  occurrenceKey?: string | null;
  /** Extra stable discriminator (step id, content hash, etc.). */
  discriminator?: string | null;
};

export type SideEffectClaim = {
  id: string;
  userId: string;
  idempotencyKey: string;
  provider: SideEffectProvider;
  actionType: SideEffectActionType;
  automationId: string | null;
  runId: string | null;
  occurrenceKey: string | null;
  destinationFingerprint: string;
  status: SideEffectStatus;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  providerResourceId: string | null;
  providerRequestId: string | null;
  evidence: Record<string, unknown>;
  resultPayload: Record<string, unknown>;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type SideEffectExecuteResult<T> = {
  result: T;
  claim: SideEffectClaim;
  /** True when this call performed the provider action. */
  executed: boolean;
  /** True when a prior succeeded claim was reused. */
  reused: boolean;
};

export class SideEffectFailClosedError extends Error {
  readonly code: string;
  readonly claim: SideEffectClaim | null;

  constructor(code: string, message: string, claim: SideEffectClaim | null = null) {
    super(message);
    this.name = "SideEffectFailClosedError";
    this.code = code;
    this.claim = claim;
  }
}

export class SideEffectLostRaceError extends Error {
  readonly code = "side_effect_lost_race";
  readonly claim: SideEffectClaim;

  constructor(claim: SideEffectClaim) {
    super("別インスタンスが副作用claimを保持しています");
    this.name = "SideEffectLostRaceError";
    this.claim = claim;
  }
}
