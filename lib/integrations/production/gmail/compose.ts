import "server-only";

import { buildIdempotencyKey } from "@/lib/integrations/production/idempotency";
import { runIntegrationAction } from "@/lib/integrations/production/execute";
import {
  createGmailDraftMessage,
  sendGmailMessage,
  type GmailComposeInput,
  type GmailComposeResult,
} from "@/lib/integrations/google/gmail/api-client";

export type ProductionGmailSendInput = GmailComposeInput & {
  userId: string;
  accessToken: string;
  mode: "send" | "draft" | "reply";
  requestId?: string;
};

/**
 * Production Gmail compose/send/reply/draft with HTML, CC/BCC, attachments,
 * and duplicate-send prevention.
 */
export async function sendGmailProduction(
  input: ProductionGmailSendInput,
): Promise<{
  value: GmailComposeResult;
  request_id: string;
  diagnosticId: string;
  duplicate: boolean;
  retry: number;
}> {
  const attachmentFingerprint = (input.attachments ?? [])
    .map((a) => `${a.filename}:${a.mimeType}:${a.content.length}`)
    .join(",");
  const fingerprint = [
    input.mode,
    input.to,
    input.cc?.join(",") ?? "",
    input.bcc?.join(",") ?? "",
    input.subject,
    input.body,
    input.htmlBody ?? "",
    input.threadId ?? "",
    input.inReplyTo ?? "",
    attachmentFingerprint,
  ].join("|");

  const idempotencyKey = buildIdempotencyKey({
    integration: "gmail",
    action: input.mode,
    userId: input.userId,
    fingerprint,
  });

  const executed = await runIntegrationAction(
    {
      integration: "gmail",
      action: input.mode,
      userId: input.userId,
      idempotencyKey,
      requestId: input.requestId,
      preventDuplicate: true,
    },
    async () => {
      if (input.mode === "draft") {
        return createGmailDraftMessage({
          accessToken: input.accessToken,
          compose: input,
        });
      }
      return sendGmailMessage({
        accessToken: input.accessToken,
        compose: input,
      });
    },
  );

  return {
    value: executed.value,
    request_id: executed.request_id,
    diagnosticId: executed.diagnosticId,
    duplicate: executed.duplicate,
    retry: executed.retry,
  };
}
