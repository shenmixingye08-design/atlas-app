import "server-only";

import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  getGmailMessagesForUser,
  saveGmailComposeDraftForUser,
  sendGmailComposeForUser,
} from "@/lib/integrations/google/gmail/service";

import { hashContent } from "../idempotency";
import { buildExecutionResult } from "../result";
import type {
  AdapterExecuteInput,
  LiveIntegrationAdapter,
  ValidationResult,
} from "../types";
import {
  failValidation,
  okValidation,
  standardIdempotencyKey,
  withAdapterGuards,
} from "./shared";

async function validateGmail(userId: string): Promise<ValidationResult> {
  const result = await getGmailMessagesForUser({
    userId,
    context: buildFeatureAccessContext(null),
    filter: "unread",
  });
  if (result.status !== "ready") {
    return failValidation(
      result.status === "feature_disabled"
        ? "needs_configuration"
        : "needs_connection",
      result.message,
    );
  }
  return okValidation("Gmail接続済み");
}

export const gmailLiveAdapter: LiveIntegrationAdapter = {
  id: "live.gmail.send",
  service: "gmail",
  mode: "production",
  availability: "available",
  classification: "production_live",
  requiresExternalActionId: true,
  validateConnection: validateGmail,
  validatePermissions: validateGmail,
  async execute(input: AdapterExecuteInput) {
    const to =
      typeof input.configuration.to === "string"
        ? input.configuration.to.trim()
        : "";
    const subject =
      typeof input.configuration.subject === "string"
        ? input.configuration.subject.trim()
        : "ATLASからのお知らせ";
    const body =
      typeof input.configuration.body === "string"
        ? input.configuration.body.trim()
        : typeof input.configuration.text === "string"
          ? input.configuration.text.trim()
          : "";
    const mode =
      input.configuration.mode === "draft" || !input.approved
        ? "draft"
        : "send";
    const contentHash =
      input.contentHash ?? hashContent(`${to}\n${subject}\n${body}`);
    const key = standardIdempotencyKey("gmail", { ...input, contentHash }, {
      recipient: to,
    });

    return withAdapterGuards({
      adapter: this,
      executeInput: input,
      idempotencyKey: key,
      run: async () => {
        const startedAt = new Date().toISOString();
        if (!to || to === "（宛先未設定）" || !body) {
          return buildExecutionResult({
            status: "failed",
            startedAt,
            errorCode: "validation_failed",
            summary: "メールの宛先または本文が不足しています",
            requiresExternalActionId: false,
          });
        }

        if (mode === "draft") {
          const draft = await saveGmailComposeDraftForUser({
            userId: input.userId,
            context: buildFeatureAccessContext(null),
            to,
            subject,
            body,
            cc:
              typeof input.configuration.cc === "string"
                ? input.configuration.cc
                : null,
            bcc:
              typeof input.configuration.bcc === "string"
                ? input.configuration.bcc
                : null,
          });
          if (draft.status !== "ready") {
            return buildExecutionResult({
              status:
                draft.status === "feature_disabled"
                  ? "needs_configuration"
                  : "needs_connection",
              startedAt,
              errorCode: draft.status,
              summary: draft.message,
              requiresExternalActionId: false,
              costUsage: { providerCalls: 1 },
            });
          }
          return buildExecutionResult({
            status: "succeeded",
            externalActionId: draft.gmailDraftId,
            externalUrl: null,
            startedAt,
            summary: `Gmail下書きを作成しました（draftId=${draft.gmailDraftId}）`,
            requiresExternalActionId: true,
            metadata: { mode: "draft" },
            costUsage: { providerCalls: 1 },
          });
        }

        if (!input.approved) {
          return buildExecutionResult({
            status: "needs_approval",
            startedAt,
            errorCode: "automation_approval_required",
            summary: "メール送信には承認が必要です",
            requiresExternalActionId: false,
          });
        }

        const sent = await sendGmailComposeForUser({
          userId: input.userId,
          context: buildFeatureAccessContext(null),
          to,
          subject,
          body,
          cc:
            typeof input.configuration.cc === "string"
              ? input.configuration.cc
              : null,
          bcc:
            typeof input.configuration.bcc === "string"
              ? input.configuration.bcc
              : null,
        });
        if (sent.status !== "ready") {
          return buildExecutionResult({
            status:
              sent.status === "feature_disabled"
                ? "needs_configuration"
                : "needs_connection",
            startedAt,
            errorCode: sent.status,
            summary: sent.message,
            requiresExternalActionId: false,
            costUsage: { providerCalls: 1 },
          });
        }

        return buildExecutionResult({
          status: "succeeded",
          externalActionId: sent.sentMessageId,
          externalUrl: `https://mail.google.com/mail/u/0/#all/${sent.sentMessageId}`,
          startedAt,
          summary: `Gmail送信完了（messageId=${sent.sentMessageId}）`,
          requiresExternalActionId: true,
          metadata: {
            mode: "send",
            threadId: sent.threadId,
            to,
          },
          costUsage: { providerCalls: 1 },
        });
      },
    });
  },
};
