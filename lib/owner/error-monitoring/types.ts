/** Owner-monitored error categories. */
export type ErrorCategoryId =
  | "google_auth"
  | "dropbox_auth"
  | "x_post"
  | "webhook"
  | "openai"
  | "stripe"
  | "vision"
  | "pdf"
  | "word"
  | "excel"
  | "wordpress"
  | "supabase"
  | "auth"
  | "image_generation"
  | "scheduler"
  | "automation";

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
  /** Optional stack trace for Error Center drill-down. */
  stackTrace: string | null;
};

export type ErrorCategoryState = {
  categoryId: ErrorCategoryId;
  occurrenceCount: number;
  lastOccurredAt: string | null;
  resolutionStatus: ErrorResolutionStatus;
  resolvedAt: string | null;
  lastMessage: string | null;
  lastStackTrace: string | null;
};

export type ErrorCategorySnapshot = ErrorCategoryState & {
  label: string;
  description: string;
};

export type ErrorMonitoringSnapshot = {
  categories: readonly ErrorCategorySnapshot[];
  recentEvents: readonly ErrorEventRecord[];
  openCount: number;
  generatedAt: string;
};
