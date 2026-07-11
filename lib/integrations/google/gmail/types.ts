export type GmailFilterId = "unread" | "today" | "this_week";

export type GmailAttachmentMeta = {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type GmailMessage = {
  id: string;
  threadId: string | null;
  subject: string;
  sender: string;
  fromEmail: string;
  toHeader: string;
  messageIdHeader: string | null;
  receivedAt: string;
  bodyText: string;
  isUnread: boolean;
  labels: readonly string[];
  labelIds: readonly string[];
  attachments: readonly GmailAttachmentMeta[];
};

export type GmailLabel = {
  id: string;
  name: string;
  type: "system" | "user";
  messagesTotal?: number;
  messagesUnread?: number;
};

export type GmailMessagesSnapshot = {
  filter: GmailFilterId | "search";
  filterLabel: string;
  query: string;
  messages: readonly GmailMessage[];
  generatedAt: string;
};

export type GmailFetchStatus =
  | "ready"
  | "google_not_connected"
  | "feature_disabled"
  | "plan_required"
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
  gmailDraftId?: string | null;
};

export type GmailPdfAnalysis = {
  messageId: string;
  attachmentId: string;
  filename: string;
  summaryLines: readonly string[];
  extractedTextPreview: string;
};
