/**
 * Live Gmail adapter — draft / send / reply with CC/BCC/attachments/signature.
 * Tokens never appear in results or logs.
 */

import "server-only";

import {
  composeGmailDraftForUser,
  sendGmailComposeForUser,
  sendReplyForUser,
  saveGmailDraftForUser,
} from "@/lib/integrations/google/gmail/service";
import { resolveFeatureAccessContextForUser } from "@/lib/live-integrations/context";
import {
  claimLiveActionOnce,
  fingerprintLiveAction,
} from "@/lib/live-integrations/duplicate";
import { withLiveRetry } from "@/lib/live-integrations/retry";
import { getLiveIntegrationStatus } from "@/lib/live-integrations/status";
import type { LiveAdapterResult } from "@/lib/live-integrations/types";

export type GmailLiveInput = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  mode: "draft" | "send" | "reply";
  signature?: string | null;
  /** Reply: Gmail message id to reply to */
  messageId?: string;
  threadId?: string | null;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    contentBase64: string;
  }>;
};

function fail(
  summary: string,
  opts?: Partial<LiveAdapterResult>,
): LiveAdapterResult {
  return {
    ok: false,
    summary,
    externalId: null,
    url: null,
    errorCode: opts?.errorCode ?? "execution_failed",
    errorMessage: opts?.errorMessage ?? summary,
    needsReconnect: opts?.needsReconnect ?? false,
    retryable: opts?.retryable ?? false,
    skippedDuplicate: opts?.skippedDuplicate ?? false,
  };
}

function ok(
  summary: string,
  externalId: string | null,
  url: string | null = null,
): LiveAdapterResult {
  return {
    ok: true,
    summary,
    externalId,
    url,
    errorCode: null,
    errorMessage: null,
    needsReconnect: false,
    retryable: false,
    skippedDuplicate: false,
  };
}

async function connectionBlock(
  userId: string,
): Promise<LiveAdapterResult | null> {
  const status = await getLiveIntegrationStatus(userId, "gmail");
  if (status.status === "connected") return null;
  return fail(status.message, {
    errorCode:
      status.status === "expired"
        ? "token_expired"
        : status.status === "insufficient_scope"
          ? "insufficient_scope"
          : "not_connected",
    needsReconnect:
      status.status === "expired" ||
      status.status === "needs_reconnect" ||
      status.status === "insufficient_scope",
  });
}

export async function executeGmailLive(
  userId: string,
  input: GmailLiveInput,
): Promise<LiveAdapterResult> {
  const blocked = await connectionBlock(userId);
  if (blocked) return blocked;

  const fingerprint = fingerprintLiveAction({
    userId,
    service: "gmail",
    action: input.mode,
    target: input.to.join(","),
    content: `${input.subject}\n${input.bodyText}`.slice(0, 2000),
  });
  const claim = claimLiveActionOnce(fingerprint);
  if (claim.duplicate) {
    return fail("同じ内容のメール送信が短時間に重複したため停止しました。", {
      errorCode: "duplicate_prevented",
      skippedDuplicate: true,
    });
  }

  const context = await resolveFeatureAccessContextForUser(userId);
  const compose = {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    signature: input.signature,
    threadId: input.threadId,
    attachments: input.attachments,
  };

  try {
    if (input.mode === "reply" && input.messageId) {
      const result = await withLiveRetry(
        () =>
          sendReplyForUser({
            userId,
            context,
            messageId: input.messageId!,
            draft: {
              messageId: input.messageId!,
              to: input.to[0] ?? "",
              subject: input.subject,
              body: input.bodyText,
            },
          }),
        "gmail.reply",
      );
      if (result.status !== "ready") {
        const auth =
          result.status === "needs_reconnect" ||
          result.status === "insufficient_permission" ||
          result.status === "google_not_connected";
        return fail(result.message, {
          errorCode: result.status,
          needsReconnect: auth,
          retryable: !auth,
        });
      }
      return ok("Gmail返信を送信しました", result.sentMessageId);
    }

    if (input.mode === "send") {
      const result = await withLiveRetry(
        () => sendGmailComposeForUser({ userId, context, compose }),
        "gmail.send",
      );
      if (result.status !== "ready") {
        const auth =
          result.status === "needs_reconnect" ||
          result.status === "insufficient_permission" ||
          result.status === "google_not_connected";
        return fail(result.message, {
          errorCode: result.status,
          needsReconnect: auth,
          retryable: !auth,
        });
      }
      return ok("Gmailを送信しました", result.messageId);
    }

    // draft (default) — also used when reply without messageId
    if (input.mode === "reply" && input.messageId) {
      const draft = await withLiveRetry(
        () =>
          saveGmailDraftForUser({
            userId,
            context,
            messageId: input.messageId!,
            draft: {
              messageId: input.messageId!,
              to: input.to[0] ?? "",
              subject: input.subject,
              body: input.bodyText,
            },
          }),
        "gmail.reply_draft",
      );
      if (draft.status !== "ready") {
        return fail(draft.message, { errorCode: draft.status });
      }
      return ok("Gmail返信下書きを保存しました", draft.gmailDraftId);
    }

    const draft = await withLiveRetry(
      () => composeGmailDraftForUser({ userId, context, compose }),
      "gmail.draft",
    );
    if (draft.status !== "ready") {
      const auth =
        draft.status === "needs_reconnect" ||
        draft.status === "insufficient_permission" ||
        draft.status === "google_not_connected";
      return fail(draft.message, {
        errorCode: draft.status,
        needsReconnect: auth,
        retryable: !auth,
      });
    }
    return ok("Gmail下書きを保存しました", draft.draftId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gmail処理に失敗しました。";
    const auth = /expired|revoked|reconnect|unauthorized|401|insufficient/i.test(
      message,
    );
    return fail(message.slice(0, 280), {
      errorCode: auth ? "auth_failed" : "execution_failed",
      needsReconnect: auth,
      retryable: !auth,
    });
  }
}
