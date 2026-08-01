import "server-only";

import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { getExternalServiceCredentials } from "@/lib/integrations/external-services/credential-store";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { getGoogleAccountAccessTokenResult } from "@/lib/integrations/google/token-manager";
import {
  GOOGLE_INSUFFICIENT_PERMISSION_MESSAGE,
  GOOGLE_NOT_CONNECTED_MESSAGE,
  GOOGLE_RECONNECT_REQUIRED_MESSAGE,
  hasGoogleCapability,
  resolveGrantedGoogleScope,
} from "@/lib/integrations/google/scopes";

import { sendGmailProduction } from "@/lib/integrations/production/gmail/compose";

import {
  addLabelToGmailMessage,
  archiveGmailMessage,
  createGmailLabel,
  extractTextFromPdfBuffer,
  fetchGmailAttachment,
  fetchGmailMessage,
  fetchGmailMessages,
  listGmailLabels,
  moveGmailMessageToSpam,
  trashGmailMessage,
  type GmailAttachmentInput,
} from "./api-client";
import { isGmailFilterId, resolveGmailSearchQuery } from "./filters";
import type {
  GmailAttachmentMeta,
  GmailFetchStatus,
  GmailFilterId,
  GmailLabel,
  GmailMessage,
  GmailMessagesResult,
  GmailMessagesSnapshot,
  GmailPdfAnalysis,
  GmailReplyDraftContent,
} from "./types";
import { analyzePdfAttachmentText } from "./ai-assistant";

type GateFailure = {
  status: Exclude<GmailFetchStatus, "ready">;
  message: string;
};

async function requireGmailAccess(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<{ accessToken: string } | GateFailure> {
  if (!isFeatureEnabled("google", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("google"),
    };
  }

  const { getBillingFeatureDenial } = await import("@/lib/billing/access");
  const denial = await getBillingFeatureDenial(
    input.userId,
    "google_integration",
  );
  if (denial) {
    return { status: "plan_required", message: denial.reason };
  }

  const connection = getExternalServiceConnection(input.userId, "google");
  if (connection.status === "error") {
    return {
      status: "needs_reconnect",
      message: connection.errorMessage ?? GOOGLE_RECONNECT_REQUIRED_MESSAGE,
    };
  }
  if (connection.status !== "connected") {
    return {
      status: "google_not_connected",
      message: GOOGLE_NOT_CONNECTED_MESSAGE,
    };
  }

  const credentials = getExternalServiceCredentials(input.userId, "google");
  const grantedScope = resolveGrantedGoogleScope(
    credentials?.scope,
    connection.scopes,
  );
  if (!hasGoogleCapability(grantedScope, "gmail")) {
    return {
      status: "insufficient_permission",
      message: GOOGLE_INSUFFICIENT_PERMISSION_MESSAGE,
    };
  }

  const tokenResult = await getGoogleAccountAccessTokenResult(input.userId);
  if (tokenResult.status === "refresh_failed") {
    return {
      status: "needs_reconnect",
      message: tokenResult.message,
    };
  }
  if (tokenResult.status !== "ready") {
    return {
      status: "google_not_connected",
      message: GOOGLE_NOT_CONNECTED_MESSAGE,
    };
  }

  return { accessToken: tokenResult.accessToken };
}

function isGateFailure(
  value: { accessToken: string } | GateFailure,
): value is GateFailure {
  return "status" in value;
}

export async function getGmailMessagesForUser(input: {
  userId: string;
  filter: GmailFilterId;
  context: FeatureAccessContext;
  now?: Date;
  searchQuery?: string | null;
}): Promise<GmailMessagesResult> {
  const access = await requireGmailAccess(input);
  if (isGateFailure(access)) return access;

  const customQuery = input.searchQuery?.trim();
  if (customQuery) {
    const messages = await fetchGmailMessages({
      accessToken: access.accessToken,
      query: customQuery,
    });
    const snapshot: GmailMessagesSnapshot = {
      filter: "search",
      filterLabel: `検索: ${customQuery}`,
      query: customQuery,
      messages,
      generatedAt: (input.now ?? new Date()).toISOString(),
    };
    return { status: "ready", snapshot };
  }

  const search = resolveGmailSearchQuery(input.filter, input.now);
  const messages = await fetchGmailMessages({
    accessToken: access.accessToken,
    query: search.query,
  });

  const snapshot: GmailMessagesSnapshot = {
    filter: input.filter,
    filterLabel: search.label,
    query: search.query,
    messages,
    generatedAt: (input.now ?? new Date()).toISOString(),
  };

  return { status: "ready", snapshot };
}

export function parseGmailFilterParam(
  value: string | null,
): GmailFilterId | null {
  if (!value || !isGmailFilterId(value)) return null;
  return value;
}

export async function getGmailMessageForUser(input: {
  userId: string;
  messageId: string;
  context: FeatureAccessContext;
}): Promise<
  | { status: "ready"; message: GmailMessage }
  | { status: Exclude<GmailFetchStatus, "ready">; message: string }
  | { status: "not_found"; message: string }
> {
  const access = await requireGmailAccess(input);
  if (isGateFailure(access)) return access;

  const message = await fetchGmailMessage({
    accessToken: access.accessToken,
    messageId: input.messageId,
  });

  if (!message) {
    return { status: "not_found", message: "メールが見つかりません" };
  }

  return { status: "ready", message };
}

export async function listGmailLabelsForUser(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<
  | { status: "ready"; labels: GmailLabel[] }
  | GateFailure
> {
  const access = await requireGmailAccess(input);
  if (isGateFailure(access)) return access;

  const labels = await listGmailLabels({ accessToken: access.accessToken });
  return { status: "ready", labels };
}

export async function createGmailLabelForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  name: string;
}): Promise<{ status: "ready"; label: GmailLabel } | GateFailure> {
  const access = await requireGmailAccess(input);
  if (isGateFailure(access)) return access;

  const label = await createGmailLabel({
    accessToken: access.accessToken,
    name: input.name.trim(),
  });
  return { status: "ready", label };
}

export async function addLabelToMessageForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  messageId: string;
  labelId: string;
}): Promise<{ status: "ready" } | GateFailure | { status: "not_found"; message: string }> {
  const access = await requireGmailAccess(input);
  if (isGateFailure(access)) return access;

  await addLabelToGmailMessage({
    accessToken: access.accessToken,
    messageId: input.messageId,
    labelId: input.labelId,
  });
  return { status: "ready" };
}

export async function archiveMessageForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  messageId: string;
}): Promise<{ status: "ready" } | GateFailure> {
  const access = await requireGmailAccess(input);
  if (isGateFailure(access)) return access;

  await archiveGmailMessage({
    accessToken: access.accessToken,
    messageId: input.messageId,
  });
  return { status: "ready" };
}

export async function spamMessageForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  messageId: string;
}): Promise<{ status: "ready" } | GateFailure> {
  const access = await requireGmailAccess(input);
  if (isGateFailure(access)) return access;

  await moveGmailMessageToSpam({
    accessToken: access.accessToken,
    messageId: input.messageId,
  });
  return { status: "ready" };
}

export async function trashMessageForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  messageId: string;
}): Promise<{ status: "ready" } | GateFailure> {
  const access = await requireGmailAccess(input);
  if (isGateFailure(access)) return access;

  await trashGmailMessage({
    accessToken: access.accessToken,
    messageId: input.messageId,
  });
  return { status: "ready" };
}

function mapDraftAttachments(
  draft: GmailReplyDraftContent,
): GmailAttachmentInput[] | undefined {
  if (!draft.attachments?.length) return undefined;
  return draft.attachments.map((attachment) => ({
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    content: Buffer.from(attachment.contentBase64 ?? "", "base64"),
  }));
}

export async function sendReplyForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  messageId: string;
  draft: GmailReplyDraftContent;
}): Promise<
  | { status: "ready"; sentMessageId: string; duplicate?: boolean }
  | GateFailure
  | { status: "not_found"; message: string }
> {
  const access = await requireGmailAccess(input);
  if (isGateFailure(access)) return access;

  const message = await fetchGmailMessage({
    accessToken: access.accessToken,
    messageId: input.messageId,
  });
  if (!message) {
    return { status: "not_found", message: "メールが見つかりません" };
  }

  const sent = await sendGmailProduction({
    userId: input.userId,
    accessToken: access.accessToken,
    mode: "reply",
    to: input.draft.to,
    subject: input.draft.subject,
    body: input.draft.body,
    htmlBody: input.draft.htmlBody,
    cc: input.draft.cc,
    bcc: input.draft.bcc,
    attachments: mapDraftAttachments(input.draft),
    inReplyTo: message.messageIdHeader,
    references: message.messageIdHeader,
    threadId: message.threadId,
  });

  return {
    status: "ready",
    sentMessageId: sent.value.id,
    duplicate: sent.duplicate,
  };
}

export async function saveGmailDraftForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  messageId: string;
  draft: GmailReplyDraftContent;
}): Promise<
  | { status: "ready"; gmailDraftId: string; duplicate?: boolean }
  | GateFailure
  | { status: "not_found"; message: string }
> {
  const access = await requireGmailAccess(input);
  if (isGateFailure(access)) return access;

  const message = await fetchGmailMessage({
    accessToken: access.accessToken,
    messageId: input.messageId,
  });
  if (!message) {
    return { status: "not_found", message: "メールが見つかりません" };
  }

  const created = await sendGmailProduction({
    userId: input.userId,
    accessToken: access.accessToken,
    mode: "draft",
    to: input.draft.to,
    subject: input.draft.subject,
    body: input.draft.body,
    htmlBody: input.draft.htmlBody,
    cc: input.draft.cc,
    bcc: input.draft.bcc,
    attachments: mapDraftAttachments(input.draft),
    inReplyTo: message.messageIdHeader,
    references: message.messageIdHeader,
    threadId: message.threadId,
  });

  return {
    status: "ready",
    gmailDraftId: created.value.id,
    duplicate: created.duplicate,
  };
}

/** Compose and send a new Gmail message (HTML / CC / BCC / attachments). */
export async function sendGmailComposeForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  to: string;
  subject: string;
  body: string;
  htmlBody?: string | null;
  cc?: string[];
  bcc?: string[];
  attachments?: GmailAttachmentInput[];
}): Promise<
  | { status: "ready"; sentMessageId: string; duplicate?: boolean }
  | GateFailure
> {
  const access = await requireGmailAccess(input);
  if (isGateFailure(access)) return access;

  const sent = await sendGmailProduction({
    userId: input.userId,
    accessToken: access.accessToken,
    mode: "send",
    to: input.to,
    subject: input.subject,
    body: input.body,
    htmlBody: input.htmlBody,
    cc: input.cc,
    bcc: input.bcc,
    attachments: input.attachments,
  });

  return {
    status: "ready",
    sentMessageId: sent.value.id,
    duplicate: sent.duplicate,
  };
}

export async function listAttachmentsForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  messageId: string;
}): Promise<
  | { status: "ready"; attachments: readonly GmailAttachmentMeta[] }
  | GateFailure
  | { status: "not_found"; message: string }
> {
  const result = await getGmailMessageForUser(input);
  if (result.status !== "ready") return result;
  return { status: "ready", attachments: result.message.attachments };
}

export async function getAttachmentBytesForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  messageId: string;
  attachmentId: string;
}): Promise<
  | { status: "ready"; buffer: Buffer; meta: GmailAttachmentMeta }
  | GateFailure
  | { status: "not_found"; message: string }
> {
  const access = await requireGmailAccess(input);
  if (isGateFailure(access)) return access;

  const message = await fetchGmailMessage({
    accessToken: access.accessToken,
    messageId: input.messageId,
  });
  if (!message) {
    return { status: "not_found", message: "メールが見つかりません" };
  }

  const meta = message.attachments.find(
    (item) => item.attachmentId === input.attachmentId,
  );
  if (!meta) {
    return { status: "not_found", message: "添付ファイルが見つかりません" };
  }

  const buffer = await fetchGmailAttachment({
    accessToken: access.accessToken,
    messageId: input.messageId,
    attachmentId: input.attachmentId,
  });

  return { status: "ready", buffer, meta };
}

export async function analyzePdfAttachmentForUser(input: {
  userId: string;
  context: FeatureAccessContext;
  messageId: string;
  attachmentId: string;
}): Promise<
  | { status: "ready"; analysis: GmailPdfAnalysis }
  | GateFailure
  | { status: "not_found"; message: string }
  | { status: "unsupported"; message: string }
> {
  const attachment = await getAttachmentBytesForUser(input);
  if (attachment.status !== "ready") return attachment;

  const isPdf =
    attachment.meta.mimeType === "application/pdf" ||
    attachment.meta.filename.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    return {
      status: "unsupported",
      message: "PDF以外の添付ファイルは解析できません",
    };
  }

  const extractedText = extractTextFromPdfBuffer(attachment.buffer);
  const summaryLines = await analyzePdfAttachmentText({
    filename: attachment.meta.filename,
    text: extractedText,
  });

  return {
    status: "ready",
    analysis: {
      messageId: input.messageId,
      attachmentId: input.attachmentId,
      filename: attachment.meta.filename,
      summaryLines,
      extractedTextPreview: extractedText.slice(0, 500),
    },
  };
}
