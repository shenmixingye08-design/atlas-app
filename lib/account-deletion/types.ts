/** Account withdrawal / scheduled purge lifecycle. */
export type AccountDeletionStatus =
  | "scheduled"
  | "canceled"
  | "purged";

export type AccountDeletionSteps = {
  stripeCanceled: boolean;
  automationsStopped: boolean;
  notificationsStopped: boolean;
  integrationsDisconnected: boolean;
};

export type AccountDeletionRecord = {
  userId: string;
  email: string | null;
  planId: string;
  planName: string;
  wasPaid: boolean;
  status: AccountDeletionStatus;
  requestedAt: string;
  /** When hard purge becomes eligible (requestedAt + 30 days). */
  deleteAfter: string;
  canceledAt: string | null;
  purgedAt: string | null;
  steps: AccountDeletionSteps;
  updatedAt: string;
};

export const ACCOUNT_DELETION_RETENTION_DAYS = 30;

export const ACCOUNT_DELETION_CONFIRMATION = "DELETE";

export type AccountDeletionOwnerRow = {
  userId: string;
  email: string | null;
  planName: string;
  status: AccountDeletionStatus;
  requestedAt: string;
  deleteAfter: string;
  restoreDeadline: string;
  daysRemaining: number;
};
