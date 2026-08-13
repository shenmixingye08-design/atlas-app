import "server-only";

import type { ExternalAdapter } from "@/lib/automation-platform/execution/adapters/types";
import {
  configMissingInput,
  configString,
  externalSuccess,
  mapProviderFailure,
  mapThrownProviderError,
} from "@/lib/automation-platform/execution/adapters/map-provider-status";
import { resolveAutomationFeatureContext } from "@/lib/automation-platform/execution/adapters/resolve-context";
import {
  createComposeDraftForUser,
  sendComposeEmailForUser,
  sendReplyForUser,
} from "@/lib/integrations/google/gmail/service";

export const invokeGmailAdapter: ExternalAdapter = async (input) => {
  const to = configString(input.step.configuration, ["to", "recipient"]);
  if (!to || to === "（宛先未設定）") {
    return configMissingInput("メール送信先が設定されていません");
  }

  const subject =
    configString(input.step.configuration, ["subject", "title"]) ||
    `【${input.automationName}】自動化からのお知らせ`;
  const body = configString(input.step.configuration, [
    "body",
    "content",
    "message",
    "text",
  ]);
  if (!body) {
    return configMissingInput("メール本文が設定されていません");
  }

  const mode =
    configString(input.step.configuration, ["mode"]) || "send";
  const replyToMessageId = configString(input.step.configuration, [
    "messageId",
    "inReplyToMessageId",
    "replyToMessageId",
  ]);

  try {
    const context = await resolveAutomationFeatureContext(input.userId);

    if (mode === "draft") {
      const drafted = await createComposeDraftForUser({
        userId: input.userId,
        context,
        to,
        subject,
        body,
        automationId: input.automationId,
        runId: input.runId,
        occurrenceKey: input.occurrenceKey ?? input.runId,
        discriminator: `${input.step.id}:draft`,
      });
      if (drafted.status !== "ready") {
        return mapProviderFailure({
          service: "Gmail",
          status: drafted.status,
          message: drafted.message,
        });
      }
      return externalSuccess({
        summary: "Gmail下書きを作成しました",
        provider: "gmail",
        operation: "compose_draft",
        resourceId: drafted.gmailDraftId,
        label: subject,
      });
    }

    if (replyToMessageId) {
      const replied = await sendReplyForUser({
        userId: input.userId,
        context,
        messageId: replyToMessageId,
        draft: { messageId: replyToMessageId, to, subject, body },
        automationId: input.automationId,
        runId: input.runId,
        occurrenceKey: input.occurrenceKey ?? input.runId,
        discriminator: `${input.step.id}:reply`,
      });
      if (replied.status !== "ready") {
        return mapProviderFailure({
          service: "Gmail",
          status: replied.status,
          message: replied.message,
        });
      }
      return externalSuccess({
        summary: "Gmailで返信を送信しました",
        provider: "gmail",
        operation: "reply_send",
        resourceId: replied.sentMessageId,
        label: subject,
      });
    }

    const sent = await sendComposeEmailForUser({
      userId: input.userId,
      context,
      to,
      subject,
      body,
      automationId: input.automationId,
      runId: input.runId,
      occurrenceKey: input.occurrenceKey ?? input.runId,
      discriminator: `${input.step.id}:send`,
    });
    if (sent.status !== "ready") {
      return mapProviderFailure({
        service: "Gmail",
        status: sent.status,
        message: sent.message,
      });
    }
    return externalSuccess({
      summary: "Gmailでメールを送信しました",
      provider: "gmail",
      operation: "compose_send",
      resourceId: sent.sentMessageId,
      label: subject,
    });
  } catch (error) {
    return mapThrownProviderError("Gmail", error);
  }
};
