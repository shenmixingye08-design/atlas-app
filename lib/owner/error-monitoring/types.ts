/** Owner-monitored error categories. */
export type ErrorCategoryId =
  | "google_auth"
  | "x_post"
  | "webhook"
  | "openai"
  | "stripe";

export type ErrorResolutionStatus = "open" | "resolved";

export type ErrorCategoryDefinition = {
  id: ErrorCategoryId;
  label: string;
  description: string;
};

export type ErrorEventRecord = {
  categoryId: ErrorCategoryId;
  message: string;
  timestamp: string;
  source: string;
};

export type ErrorCategoryState = {
  categoryId: ErrorCategoryId;
  occurrenceCount: number;
  lastOccurredAt: string | null;
  resolutionStatus: ErrorResolutionStatus;
  resolvedAt: string | null;
  lastMessage: string | null;
};

export type ErrorCategorySnapshot = ErrorCategoryState & {
  label: string;
  description: string;
};

export type ErrorMonitoringSnapshot = {
  categories: readonly ErrorCategorySnapshot[];
  openCount: number;
  generatedAt: string;
};
