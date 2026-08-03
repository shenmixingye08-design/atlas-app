/**
 * Runtime validation for Gmail Automation step input.
 */

import { createHash } from "node:crypto";

import { resolveGmailRecipients } from "./recipients";
import {
  GMAIL_ACTIONS,
  type GmailLiveAction,
  type GmailResolvedRecipients,
  type GmailStepInput,
} from "./types";

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function resolveAction(
  configuration: Readonly<Record<string, unknown>>,
): GmailLiveAction {
  const raw = asString(configuration.action) ?? asString(configuration.mode) ?? "draft";
  const normalized = raw.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "create_draft") return "draft";
  if (normalized === "send_message") return "send";
  if ((GMAIL_ACTIONS as readonly string[]).includes(normalized)) {
    return normalized as GmailLiveAction;
  }
  throw new Error(`gmail invalid action: ${raw}`);
}

export function hashGmailRecipients(recipients: GmailResolvedRecipients): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        to: recipients.to,
        cc: recipients.cc,
        bcc: recipients.bcc,
      }),
    )
    .digest("hex");
}

export function hashGmailSubject(subject: string): string {
  return createHash("sha256").update(subject).digest("hex");
}

export function hashGmailBody(textBody: string, htmlBody: string | null): string {
  return createHash("sha256")
    .update(`${textBody}\n---\n${htmlBody ?? ""}`)
    .digest("hex");
}

export function hashGmailAttachments(ids: string[]): string {
  return createHash("sha256")
    .update([...ids].sort().join("|"))
    .digest("hex");
}

export function buildGmailIdempotencyKey(input: {
  ownerId: string;
  runId: string;
  stepId: string;
  action: GmailLiveAction;
  recipientHash: string;
  subjectHash: string;
  bodyHash: string;
  attachmentHash: string;
  occurrenceKey?: string | null;
  explicitKey?: string | null;
}): string {
  if (input.explicitKey?.trim()) {
    return `${input.action}:${input.explicitKey.trim()}`;
  }
  return createHash("sha256")
    .update(
      [
        input.ownerId,
        input.runId,
        input.stepId,
        input.action,
        input.recipientHash,
        input.subjectHash,
        input.bodyHash,
        input.attachmentHash,
        input.occurrenceKey ?? "",
      ].join("|"),
    )
    .digest("hex");
}

export function resolveGmailStepInput(input: {
  ownerId: string;
  organizationId?: string | null;
  runId: string;
  stepId: string;
  diagnosticId?: string | null;
  configuration: Readonly<Record<string, unknown>>;
  inputBindings: Readonly<Record<string, unknown>>;
  selfEmail?: string | null;
  occurrenceKey?: string | null;
}): { stepInput: GmailStepInput; recipients: GmailResolvedRecipients } {
  const cfg = {
    ...input.inputBindings,
    ...input.configuration,
  };
  const action = resolveAction(cfg);
  const recipients = resolveGmailRecipients({
    to: cfg.to ?? cfg.recipient ?? cfg.recipients,
    cc: cfg.cc,
    bcc: cfg.bcc,
    selfEmail: input.selfEmail,
  });

  const subject =
    asString(cfg.subject) ??
    (action === "reply" ? "Re: (no subject)" : null);
  if (!subject) {
    throw new Error("gmail invalid input: subject is required");
  }

  const textBody =
    asString(cfg.textBody) ??
    asString(cfg.body) ??
    asString(cfg.content) ??
    "";
  const htmlBody = asString(cfg.htmlBody) ?? asString(cfg.html) ?? null;

  const attachmentArtifactIds = [
    ...asStringArray(cfg.attachmentArtifactIds),
    ...asStringArray(cfg.artifactIds),
    ...asStringArray(cfg.attachments),
  ];
  const singleArtifact = asString(cfg.artifactId);
  if (singleArtifact) attachmentArtifactIds.push(singleArtifact);

  const uniqueAttachments = [...new Set(attachmentArtifactIds)];

  const approvalRequired =
    cfg.approvalRequired === false || cfg.approvalRequired === "false"
      ? false
      : action === "draft"
        ? false
        : true;

  const recipientHash = hashGmailRecipients(recipients);
  const subjectHash = hashGmailSubject(subject);
  const bodyHash = hashGmailBody(textBody, htmlBody);
  const attachmentHash = hashGmailAttachments(uniqueAttachments);
  const explicitKey = asString(cfg.idempotencyKey);

  const stepInput: GmailStepInput = {
    action,
    to: recipients.to,
    cc: recipients.cc,
    bcc: recipients.bcc,
    subject,
    textBody,
    htmlBody,
    attachmentArtifactIds: uniqueAttachments,
    replyToMessageId:
      asString(cfg.replyToMessageId) ?? asString(cfg.inReplyToMessageId),
    threadId: asString(cfg.threadId),
    inReplyTo: asString(cfg.inReplyTo),
    references: asString(cfg.references),
    signatureProfileId: asString(cfg.signatureProfileId),
    approvalRequired,
    idempotencyKey: buildGmailIdempotencyKey({
      ownerId: input.ownerId,
      runId: input.runId,
      stepId: input.stepId,
      action,
      recipientHash,
      subjectHash,
      bodyHash,
      attachmentHash,
      occurrenceKey: input.occurrenceKey,
      explicitKey,
    }),
    ownerId: input.ownerId,
    organizationId: input.organizationId ?? null,
    runId: input.runId,
    stepId: input.stepId,
    diagnosticId: input.diagnosticId?.trim() || input.runId,
    draftId: asString(cfg.draftId),
  };

  return { stepInput, recipients };
}
