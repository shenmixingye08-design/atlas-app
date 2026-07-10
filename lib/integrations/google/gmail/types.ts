export type GmailFilterId = "unread" | "today" | "this_week";

export type GmailMessage = {
  id: string;
  subject: string;
  sender: string;
  receivedAt: string;
  bodyText: string;
  isUnread: boolean;
  labels: readonly string[];
};

export type GmailMessagesSnapshot = {
  filter: GmailFilterId;
  filterLabel: string;
  messages: readonly GmailMessage[];
  generatedAt: string;
};

export type GmailFetchStatus =
  | "ready"
  | "google_not_connected"
  | "feature_disabled"
  | "unauthorized";

export type GmailMessagesResult =
  | {
      status: "ready";
      snapshot: GmailMessagesSnapshot;
    }
  | {
      status: Exclude<GmailFetchStatus, "ready">;
      message: string;
    };

export type GmailMessageAnalysis = {
  messageId: string;
  isImportant: boolean;
  importanceReason: string;
  summaryLines: readonly string[];
};

export type GmailReplyDraftContent = {
  messageId: string;
  subject: string;
  to: string;
  body: string;
};

export type GmailSavedReplyDraft = GmailReplyDraftContent & {
  id: string;
  userId: string;
  savedAt: string;
};
