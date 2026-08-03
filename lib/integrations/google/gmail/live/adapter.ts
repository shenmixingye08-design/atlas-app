/**
 * Gmail Production Live Adapter.
 * Never falls back to sandbox/mock success.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { validateGmailConnection, validateGmailScopes } from "./connection";
import { loadGmailAttachmentsFromArtifacts } from "./attachments";
import {
  buildGmailResultHash,
  findGmailActionByIdempotency,
  saveGmailExternalAction,
} from "./idempotency";
import {
  hashGmailAttachments,
  resolveGmailStepInput,
} from "./input";
import {
  recordGmailApprovalWait,
  recordGmailAttachmentFailure,
  recordGmailDraftAttempt,
  recordGmailDuplicatePrevented,
  recordGmailFailure,
  recordGmailInvalidRecipient,
  recordGmailRetry,
  recordGmailScopeError,
  recordGmailSendAttempt,
  recordGmailSuccess,
  recordGmailTokenRefresh,
  recordGmailVerificationFailure,
} from "./metrics";
import {
  createAndVerifyGmailDraft,
  getGmailDraftVerified,
  getGmailMessageVerified,
  resolveReplyTarget,
  sendAndVerifyGmailMessage,
  sendGmailDraftAndVerify,
} from "./operations";
import { classifyGmailProviderError, withGmailRetry } from "./retry";
import { applyGmailSignature, resolveGmailSignature } from "./signature";
import {
  GMAIL_ADAPTER_MODE,
  type GmailAdapterResult,
  type GmailExternalAction,
  type GmailLiveAction,
} from "./types";

function resolveEnvironment(): string {
  return (
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "development"
  );
}

function scopeActionFor(action: GmailLiveAction) {
  if (action === "reply") return "reply" as const;
  if (action === "send" || action === "send_draft") return "send" as const;
  return "draft" as const;
}

function toExternalAction(input: {
  action: GmailLiveAction;
  draftId: string | null;
  messageId: string | null;
  threadId: string | null;
  recipientHash: string;
  subjectHash: string;
  bodyHash: string;
  attachmentHash: string;
  attachmentIds: string[];
  status: "verified" | "awaiting_approval";
  startedAt: string;
  completedAt: string;
  retryCount: number;
  idempotencyKey: string;
  diagnosticId: string;
  approvalId: string | null;
  duplicatePrevented?: boolean;
  deliveryGuarantee: "provider_accepted" | "not_applicable";
}): GmailExternalAction {
  const resultHash = buildGmailResultHash({
    action: input.action,
    draftId: input.draftId,
    messageId: input.messageId,
    threadId: input.threadId,
    recipientHash: input.recipientHash,
    subjectHash: input.subjectHash,
    bodyHash: input.bodyHash,
    attachmentHash: input.attachmentHash,
  });
  return {
    externalActionId: `gmail_${randomUUID()}`,
    service: "gmail",
    action: input.action,
    draftId: input.draftId,
    messageId: input.messageId,
    threadId: input.threadId,
    recipientHash: input.recipientHash,
    subjectHash: input.subjectHash,
    bodyHash: input.bodyHash,
    attachmentHash: input.attachmentHash,
    attachmentIds: input.attachmentIds,
    attachmentCount: input.attachmentIds.length,
    status: input.status,
    adapterMode: GMAIL_ADAPTER_MODE,
    environment: resolveEnvironment(),
    diagnosticId: input.diagnosticId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    retryCount: input.retryCount,
    idempotencyKey: input.idempotencyKey,
    providerRequestId: input.messageId ?? input.draftId,
    resultHash,
    duplicatePrevented: input.duplicatePrevented ?? false,
    approvalId: input.approvalId,
    deliveryGuarantee: input.deliveryGuarantee,
  };
}

export const googleGmailLiveAdapter = {
  mode: GMAIL_ADAPTER_MODE,

  async validateConnection(ownerId: string, action: GmailLiveAction = "draft") {
    return validateGmailConnection(ownerId, scopeActionFor(action));
  },

  async validateScopes(ownerId: string, action: GmailLiveAction = "draft") {
    return validateGmailScopes(ownerId, scopeActionFor(action));
  },

  async refreshToken(ownerId: string) {
    const result = await validateGmailConnection(ownerId, "draft");
    if (result.refreshed) recordGmailTokenRefresh();
    return result;
  },

  async getDraft(input: { accessToken: string; draftId: string }) {
    return getGmailDraftVerified(input);
  },

  async getMessage(input: { accessToken: string; messageId: string }) {
    return getGmailMessageVerified(input);
  },

  async execute(input: {
    ownerId: string;
    organizationId?: string | null;
    runId: string;
    stepId: string;
    diagnosticId?: string | null;
    configuration: Readonly<Record<string, unknown>>;
    inputBindings: Readonly<Record<string, unknown>>;
    approved: boolean;
    approvalId?: string | null;
    occurrenceKey?: string | null;
    personalization?: {
      signatureText?: string | null;
      signatureHtml?: string | null;
      companySignatureText?: string | null;
      companySignatureHtml?: string | null;
    } | null;
  }): Promise<GmailAdapterResult> {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    let retryCount = 0;
    let parsedAction: GmailLiveAction = "draft";

    try {
      let stepInput;
      let recipients;
      try {
        const resolved = resolveGmailStepInput({
          ownerId: input.ownerId,
          organizationId: input.organizationId,
          runId: input.runId,
          stepId: input.stepId,
          diagnosticId: input.diagnosticId,
          configuration: input.configuration,
          inputBindings: input.inputBindings,
          occurrenceKey: input.occurrenceKey,
        });
        stepInput = resolved.stepInput;
        recipients = resolved.recipients;
        parsedAction = stepInput.action;
      } catch (error) {
        recordGmailInvalidRecipient();
        recordGmailFailure();
        return {
          ok: false,
          errorCode: "gmail_invalid_recipient",
          errorMessage:
            error instanceof Error ? error.message : "invalid recipient",
          retryable: false,
          retryCount: 0,
        };
      }

      const connection = await this.validateConnection(
        input.ownerId,
        stepInput.action,
      );
      if (connection.refreshed) recordGmailTokenRefresh();
      if (!connection.ready || !connection.accessToken) {
        if (connection.health === "missing_scope") recordGmailScopeError();
        if (parsedAction === "draft") recordGmailDraftAttempt(Date.now() - startedMs);
        else recordGmailSendAttempt(Date.now() - startedMs);
        recordGmailFailure();
        return {
          ok: false,
          errorCode:
            connection.health === "missing_scope"
              ? "gmail_missing_scope"
              : connection.health === "disconnected"
                ? "gmail_not_connected"
                : "gmail_reconnect_required",
          errorMessage: connection.message ?? "Gmail is not ready",
          retryable: false,
          connectionHealth: connection.health,
          needsUserInput: true,
          retryCount: 0,
        };
      }

      // Re-resolve with self email warning.
      const resolvedWithSelf = resolveGmailStepInput({
        ownerId: input.ownerId,
        organizationId: input.organizationId,
        runId: input.runId,
        stepId: input.stepId,
        diagnosticId: input.diagnosticId,
        configuration: input.configuration,
        inputBindings: input.inputBindings,
        selfEmail: connection.accountEmail,
        occurrenceKey: input.occurrenceKey,
      });
      stepInput = resolvedWithSelf.stepInput;
      recipients = resolvedWithSelf.recipients;

      const existing = await findGmailActionByIdempotency({
        ownerId: input.ownerId,
        idempotencyKey: stepInput.idempotencyKey,
      });
      if (existing) {
        // Awaiting approval: only restore as duplicate when still unapproved.
        // When approved, fall through to send the existing draft (do not early-return).
        if (existing.status === "awaiting_approval") {
          if (!input.approved) {
            recordGmailDuplicatePrevented();
            recordGmailApprovalWait();
            recordGmailDraftAttempt(Date.now() - startedMs);
            recordGmailSuccess();
            return {
              ok: true,
              awaitingApproval: true,
              recipients,
              subject: stepInput.subject,
              action: { ...existing, duplicatePrevented: true },
            };
          }
          // approved → continue to send path using existing.draftId
        } else {
          if (existing.draftId && !existing.messageId) {
            const verified = await getGmailDraftVerified({
              accessToken: connection.accessToken,
              draftId: existing.draftId,
            });
            if (!verified.draftId || verified.draftId !== existing.draftId) {
              recordGmailVerificationFailure();
              throw new Error(
                "verification failed: idempotent draft not re-fetchable",
              );
            }
          } else if (existing.messageId) {
            const verified = await getGmailMessageVerified({
              accessToken: connection.accessToken,
              messageId: existing.messageId,
            });
            if (verified.messageId !== existing.messageId) {
              recordGmailVerificationFailure();
              throw new Error(
                "verification failed: idempotent message not re-fetchable",
              );
            }
          }
          recordGmailDuplicatePrevented();
          if (existing.action === "draft") {
            recordGmailDraftAttempt(Date.now() - startedMs);
          } else {
            recordGmailSendAttempt(Date.now() - startedMs);
          }
          recordGmailSuccess();
          return {
            ok: true,
            awaitingApproval: false,
            recipients,
            subject: stepInput.subject,
            action: { ...existing, duplicatePrevented: true },
          };
        }
      }

      let attachments;
      try {
        attachments = await loadGmailAttachmentsFromArtifacts({
          ownerId: input.ownerId,
          artifactIds: stepInput.attachmentArtifactIds,
        });
      } catch (error) {
        recordGmailAttachmentFailure();
        recordGmailFailure();
        return {
          ok: false,
          errorCode: "gmail_attachment_failed",
          errorMessage:
            error instanceof Error ? error.message : "attachment failed",
          retryable: false,
          retryCount: 0,
        };
      }

      const signature = resolveGmailSignature({
        explicitText:
          typeof input.configuration.signatureText === "string"
            ? input.configuration.signatureText
            : null,
        explicitHtml:
          typeof input.configuration.signatureHtml === "string"
            ? input.configuration.signatureHtml
            : null,
        profileId: stepInput.signatureProfileId,
        personalization: input.personalization,
      });
      const withSignature = applyGmailSignature({
        textBody: stepInput.textBody,
        htmlBody: stepInput.htmlBody,
        signature,
        isReply: stepInput.action === "reply",
      });

      let threadId = stepInput.threadId;
      let inReplyTo = stepInput.inReplyTo;
      let references = stepInput.references;
      let subject = stepInput.subject;

      if (stepInput.action === "reply") {
        if (!stepInput.replyToMessageId) {
          return {
            ok: false,
            errorCode: "gmail_reply_target_invalid",
            errorMessage: "replyToMessageId is required for reply",
            retryable: false,
            retryCount: 0,
          };
        }
        const target = await resolveReplyTarget({
          accessToken: connection.accessToken,
          replyToMessageId: stepInput.replyToMessageId,
          ownerId: input.ownerId,
        });
        threadId = target.threadId;
        inReplyTo = target.inReplyTo;
        references = target.references;
        if (!/^re:/i.test(subject)) {
          subject = target.subject;
        }
      }

      const wantsSend =
        stepInput.action === "send" ||
        stepInput.action === "send_draft" ||
        stepInput.action === "reply";

      if (wantsSend && stepInput.approvalRequired && !input.approved) {
        // Draft first, then wait for approval — never send.
        const retried = await withGmailRetry(async () =>
          createAndVerifyGmailDraft({
            accessToken: connection.accessToken!,
            recipients,
            subject,
            textBody: withSignature.textBody,
            htmlBody: withSignature.htmlBody,
            attachments,
            threadId,
            inReplyTo,
            references,
          }),
        );
        retryCount = retried.retryCount;
        if (retryCount > 0) {
          for (let i = 0; i < retryCount; i += 1) recordGmailRetry();
        }
        const draft = retried.value;
        const attachmentHash = hashGmailAttachments(
          stepInput.attachmentArtifactIds,
        );
        // Persist under draft idempotency as awaiting send approval marker.
        const action = toExternalAction({
          action: "draft",
          draftId: draft.draftId,
          messageId: draft.messageId,
          threadId: draft.threadId,
          recipientHash: draft.recipientHash,
          subjectHash: draft.subjectHash,
          bodyHash: draft.bodyHash,
          attachmentHash,
          attachmentIds: stepInput.attachmentArtifactIds,
          status: "awaiting_approval",
          startedAt,
          completedAt: new Date().toISOString(),
          retryCount,
          idempotencyKey: stepInput.idempotencyKey.replace(/^send:/, "draft:").replace(/^reply:/, "draft:"),
          diagnosticId: stepInput.diagnosticId,
          approvalId: null,
          deliveryGuarantee: "not_applicable",
        });
        // Also store under the original send key so re-entry finds it.
        const awaiting = {
          ...action,
          action: stepInput.action,
          status: "awaiting_approval" as const,
          idempotencyKey: stepInput.idempotencyKey,
        };
        await saveGmailExternalAction({
          ...awaiting,
          ownerId: input.ownerId,
          organizationId: input.organizationId ?? null,
          runId: input.runId,
          stepId: input.stepId,
        });
        recordGmailDraftAttempt(Date.now() - startedMs);
        recordGmailApprovalWait();
        recordGmailSuccess();
        return {
          ok: true,
          awaitingApproval: true,
          recipients,
          subject,
          action: awaiting,
        };
      }

      if (stepInput.action === "draft" || (!wantsSend && !input.approved)) {
        const retried = await withGmailRetry(async () =>
          createAndVerifyGmailDraft({
            accessToken: connection.accessToken!,
            recipients,
            subject,
            textBody: withSignature.textBody,
            htmlBody: withSignature.htmlBody,
            attachments,
            threadId,
            inReplyTo,
            references,
          }),
        );
        retryCount = retried.retryCount;
        if (retryCount > 0) {
          for (let i = 0; i < retryCount; i += 1) recordGmailRetry();
        }
        const draft = retried.value;
        const attachmentHash = hashGmailAttachments(
          stepInput.attachmentArtifactIds,
        );
        const action = toExternalAction({
          action: "draft",
          draftId: draft.draftId,
          messageId: draft.messageId,
          threadId: draft.threadId,
          recipientHash: draft.recipientHash,
          subjectHash: draft.subjectHash,
          bodyHash: draft.bodyHash,
          attachmentHash,
          attachmentIds: stepInput.attachmentArtifactIds,
          status: "verified",
          startedAt,
          completedAt: new Date().toISOString(),
          retryCount,
          idempotencyKey: stepInput.idempotencyKey,
          diagnosticId: stepInput.diagnosticId,
          approvalId: input.approvalId ?? null,
          deliveryGuarantee: "not_applicable",
        });
        await saveGmailExternalAction({
          ...action,
          ownerId: input.ownerId,
          organizationId: input.organizationId ?? null,
          runId: input.runId,
          stepId: input.stepId,
        });
        recordGmailDraftAttempt(Date.now() - startedMs);
        recordGmailSuccess();
        return {
          ok: true,
          awaitingApproval: false,
          recipients,
          subject,
          action,
        };
      }

      // Approved send / reply path
      const priorAwaiting = await findGmailActionByIdempotency({
        ownerId: input.ownerId,
        idempotencyKey: stepInput.idempotencyKey,
      });
      if (
        priorAwaiting?.draftId &&
        priorAwaiting.status === "awaiting_approval" &&
        input.approved
      ) {
        const retried = await withGmailRetry(async () =>
          sendGmailDraftAndVerify({
            accessToken: connection.accessToken!,
            draftId: priorAwaiting.draftId!,
            expectedRecipients: recipients,
            expectedSubject: subject,
            expectedAttachmentCount: attachments.length,
          }),
        );
        retryCount = retried.retryCount;
        if (retryCount > 0) {
          for (let i = 0; i < retryCount; i += 1) recordGmailRetry();
        }
        const sent = retried.value;
        const attachmentHash = hashGmailAttachments(
          stepInput.attachmentArtifactIds,
        );
        const action = toExternalAction({
          action: stepInput.action,
          draftId: priorAwaiting.draftId,
          messageId: sent.messageId,
          threadId: sent.threadId,
          recipientHash: priorAwaiting.recipientHash,
          subjectHash: priorAwaiting.subjectHash,
          bodyHash: priorAwaiting.bodyHash,
          attachmentHash,
          attachmentIds: stepInput.attachmentArtifactIds,
          status: "verified",
          startedAt,
          completedAt: new Date().toISOString(),
          retryCount,
          idempotencyKey: stepInput.idempotencyKey,
          diagnosticId: stepInput.diagnosticId,
          approvalId: input.approvalId ?? null,
          deliveryGuarantee: "provider_accepted",
        });
        await saveGmailExternalAction({
          ...action,
          ownerId: input.ownerId,
          organizationId: input.organizationId ?? null,
          runId: input.runId,
          stepId: input.stepId,
        });
        recordGmailSendAttempt(Date.now() - startedMs);
        recordGmailSuccess();
        return {
          ok: true,
          awaitingApproval: false,
          recipients,
          subject,
          action,
        };
      }

      const retried = await withGmailRetry(async () =>
        sendAndVerifyGmailMessage({
          accessToken: connection.accessToken!,
          recipients,
          subject,
          textBody: withSignature.textBody,
          htmlBody: withSignature.htmlBody,
          attachments,
          threadId,
          inReplyTo,
          references,
        }),
      );
      retryCount = retried.retryCount;
      if (retryCount > 0) {
        for (let i = 0; i < retryCount; i += 1) recordGmailRetry();
      }
      const sent = retried.value;
      const attachmentHash = hashGmailAttachments(
        stepInput.attachmentArtifactIds,
      );
      const action = toExternalAction({
        action: stepInput.action,
        draftId: null,
        messageId: sent.messageId,
        threadId: sent.threadId,
        recipientHash: sent.recipientHash,
        subjectHash: sent.subjectHash,
        bodyHash: sent.bodyHash,
        attachmentHash,
        attachmentIds: stepInput.attachmentArtifactIds,
        status: "verified",
        startedAt,
        completedAt: new Date().toISOString(),
        retryCount,
        idempotencyKey: stepInput.idempotencyKey,
        diagnosticId: stepInput.diagnosticId,
        approvalId: input.approvalId ?? null,
        deliveryGuarantee: "provider_accepted",
      });
      await saveGmailExternalAction({
        ...action,
        ownerId: input.ownerId,
        organizationId: input.organizationId ?? null,
        runId: input.runId,
        stepId: input.stepId,
      });
      recordGmailSendAttempt(Date.now() - startedMs);
      recordGmailSuccess();
      return {
        ok: true,
        awaitingApproval: false,
        recipients,
        subject,
        action,
      };
    } catch (error) {
      const classified = classifyGmailProviderError(error);
      if (/verification failed/i.test(
        error instanceof Error ? error.message : String(error),
      )) {
        recordGmailVerificationFailure();
      }
      if (parsedAction === "draft") {
        recordGmailDraftAttempt(Date.now() - startedMs);
      } else {
        recordGmailSendAttempt(Date.now() - startedMs);
      }
      recordGmailFailure();
      return {
        ok: false,
        errorCode: classified.errorCode,
        errorMessage:
          error instanceof Error ? error.message : "Gmail operation failed",
        retryable: classified.retryable,
        retryCount,
      };
    }
  },
};
