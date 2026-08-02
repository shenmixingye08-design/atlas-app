import "server-only";

import {
  emptyCostUsage,
  failResult,
  newRequestIds,
  type AutomationStepAdapter,
  type AutomationStepAdapterContext,
  type StepExecutionResult,
} from "@/lib/automation-platform/adapters/types";
import {
  buildExternalActionKey,
  completeIdempotencyRecord,
  reserveIdempotencyKey,
} from "@/lib/automation-platform/adapters/idempotency-store";
import { createCalendarEventForUser } from "@/lib/integrations/google/calendar/service";
import {
  createGmailComposeDraftForUser,
  saveGmailDraftForUser,
  sendReplyForUser,
} from "@/lib/integrations/google/gmail/service";
import { uploadDropboxFileForUser } from "@/lib/integrations/dropbox/service";
import { postTweetNowForUser } from "@/lib/integrations/x/post/service";
import { createWordPressPostForUser } from "@/lib/integrations/wordpress/post/service";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";

async function withExternalIdempotency(
  context: AutomationStepAdapterContext,
  action: string,
  execute: () => Promise<StepExecutionResult>,
): Promise<StepExecutionResult> {
  const key = buildExternalActionKey({
    automationId: context.automationId,
    occurrenceKey: context.occurrenceKey,
    stepId: context.step.id,
    action,
  });
  const reserved = await reserveIdempotencyKey({
    userId: context.userId,
    key,
    kind: "external_action",
    runId: context.runId,
    stepId: context.step.id,
  });
  if (!reserved.created && reserved.record.externalActionId) {
    const ids = newRequestIds();
    const now = new Date().toISOString();
    return {
      status: "succeeded",
      startedAt: now,
      completedAt: now,
      summary: `${action} は既に実行済みです（重複防止）`,
      outputBindings: {
        externalActionId: reserved.record.externalActionId,
        deduped: true,
      },
      artifacts: [
        {
          id: reserved.record.externalActionId,
          kind: "external",
          label: `${action} (deduped)`,
          url: null,
          externalId: reserved.record.externalActionId,
          createdAt: reserved.record.createdAt,
          sourceRunId: context.runId,
          sourceStepId: context.step.id,
        },
      ],
      artifactIds: [reserved.record.externalActionId],
      externalActionIds: [reserved.record.externalActionId],
      notificationIds: [],
      requestId: ids.requestId,
      diagnosticId: ids.diagnosticId,
      retryable: false,
      errorCode: null,
      errorMessage: null,
      costUsage: emptyCostUsage(),
    };
  }

  const result = await execute();
  if (result.status === "succeeded" && result.externalActionIds[0]) {
    await completeIdempotencyRecord({
      userId: context.userId,
      key,
      externalActionId: result.externalActionIds[0],
    });
  }
  return result;
}

export const xPostAdapter: AutomationStepAdapter = {
  type: "x_post",
  async validateConfiguration(context) {
    const text =
      typeof context.step.configuration.text === "string"
        ? context.step.configuration.text.trim()
        : "";
    if (!text) {
      return {
        ok: false,
        code: "insufficient_input",
        message: "投稿本文が設定されていません",
        needsUserInput: true,
      };
    }
    return { ok: true, code: "ok", message: "ok" };
  },
  async execute(context) {
    const startedAt = new Date().toISOString();
    if (!context.approved) {
      return failResult({
        status: "needs_input",
        summary: "X投稿には承認が必要です",
        errorCode: "automation_approval_required",
        errorMessage: "approval required for x_post",
        startedAt,
      });
    }

    const text =
      (typeof context.step.configuration.text === "string" &&
        context.step.configuration.text.trim()) ||
      context.instructionText.trim();
    if (!text) {
      return failResult({
        status: "needs_input",
        summary: "投稿本文が設定されていません",
        errorCode: "automation_integration_required",
        errorMessage: "tweet text missing",
        startedAt,
      });
    }

    return withExternalIdempotency(context, "x_post", async () => {
      await ensureExternalAuthHydrated(context.userId);
      const result = await postTweetNowForUser({
        userId: context.userId,
        text,
        context: context.access,
      });
      const ids = newRequestIds();
      if (result.status !== "ready") {
        const retryable = result.status === "error";
        return failResult({
          status:
            result.status === "x_not_connected" ||
            result.status === "needs_reconnect" ||
            result.status === "feature_disabled"
              ? "needs_configuration"
              : "failed",
          summary: result.message || "X投稿に失敗しました",
          errorCode:
            result.status === "x_not_connected" ||
            result.status === "needs_reconnect"
              ? "automation_integration_required"
              : "automation_run_failed",
          errorMessage: result.message || result.status,
          retryable,
          startedAt,
        });
      }

      const tweetId = result.history?.tweetId;
      if (!tweetId) {
        return failResult({
          status: "failed",
          summary: "X投稿結果にtweetIdがありません",
          errorCode: "automation_run_failed",
          errorMessage: "x post succeeded without tweetId",
          startedAt,
        });
      }

      return {
        status: "succeeded",
        startedAt,
        completedAt: new Date().toISOString(),
        summary: "Xへ投稿しました",
        outputBindings: { tweetId },
        artifacts: [
          {
            id: tweetId,
            kind: "external",
            label: "X投稿",
            url: result.history?.tweetUrl ?? null,
            externalId: tweetId,
            createdAt: new Date().toISOString(),
            sourceRunId: context.runId,
            sourceStepId: context.step.id,
          },
        ],
        artifactIds: [tweetId],
        externalActionIds: [tweetId],
        notificationIds: [],
        requestId: ids.requestId,
        diagnosticId: ids.diagnosticId,
        retryable: false,
        errorCode: null,
        errorMessage: null,
        costUsage: { ...emptyCostUsage(), externalCalls: 1 },
      };
    });
  },
};

export const gmailAdapter: AutomationStepAdapter = {
  type: "gmail",
  async validateConfiguration(context) {
    const to =
      typeof context.step.configuration.to === "string"
        ? context.step.configuration.to.trim()
        : "";
    if (!to || to === "（宛先未設定）") {
      return {
        ok: false,
        code: "insufficient_input",
        message: "メール送信先が設定されていません",
        needsUserInput: true,
      };
    }
    return { ok: true, code: "ok", message: "ok" };
  },
  async execute(context) {
    const startedAt = new Date().toISOString();

    const to = String(context.step.configuration.to ?? "").trim();
    const cc =
      typeof context.step.configuration.cc === "string"
        ? context.step.configuration.cc.trim()
        : "";
    const bcc =
      typeof context.step.configuration.bcc === "string"
        ? context.step.configuration.bcc.trim()
        : "";
    const subject =
      (typeof context.step.configuration.subject === "string" &&
        context.step.configuration.subject.trim()) ||
      context.automationName;
    const body =
      (typeof context.step.configuration.body === "string" &&
        context.step.configuration.body.trim()) ||
      context.instructionText ||
      context.freeformNotes;
    const messageId =
      typeof context.step.configuration.messageId === "string"
        ? context.step.configuration.messageId.trim()
        : "";
    const mode =
      context.step.configuration.mode === "send" ? "send" : "draft";

    if (!to || !to.includes("@")) {
      return failResult({
        status: "needs_input",
        summary: "有効なメール宛先が必要です",
        errorCode: "automation_integration_required",
        errorMessage: "invalid gmail recipient",
        startedAt,
      });
    }

    if (mode === "send" && !context.approved) {
      return failResult({
        status: "needs_input",
        summary: "Gmail送信には承認が必要です",
        errorCode: "automation_approval_required",
        errorMessage: "approval required for gmail send",
        startedAt,
      });
    }

    return withExternalIdempotency(context, `gmail_${mode}`, async () => {
      await ensureExternalAuthHydrated(context.userId);
      const ids = newRequestIds();

      if (mode === "send") {
        if (!messageId) {
          return failResult({
            status: "needs_configuration",
            summary:
              "Gmail送信は返信対象 messageId が必要です（新規compose送信は未対応）",
            errorCode: "automation_integration_required",
            errorMessage: "gmail send requires messageId",
            startedAt,
          });
        }
        const sent = await sendReplyForUser({
          userId: context.userId,
          context: context.access,
          messageId,
          draft: { to, subject, body },
        });
        if (sent.status !== "ready") {
          return failResult({
            status: "needs_configuration",
            summary:
              ("message" in sent && sent.message) || "Gmail送信に失敗しました",
            errorCode: "automation_integration_required",
            errorMessage: sent.status,
            startedAt,
          });
        }
        const sentId = sent.sentMessageId;
        return {
          status: "succeeded",
          startedAt,
          completedAt: new Date().toISOString(),
          summary: "Gmailで送信しました",
          outputBindings: { messageId: sentId, to },
          artifacts: [
            {
              id: sentId,
              kind: "external",
              label: `Gmail送信: ${subject}`,
              url: null,
              externalId: sentId,
              createdAt: new Date().toISOString(),
              sourceRunId: context.runId,
              sourceStepId: context.step.id,
            },
          ],
          artifactIds: [sentId],
          externalActionIds: [sentId],
          notificationIds: [],
          requestId: ids.requestId,
          diagnosticId: ids.diagnosticId,
          retryable: false,
          errorCode: null,
          errorMessage: null,
          costUsage: { ...emptyCostUsage(), externalCalls: 1 },
        };
      }

      const result = messageId
        ? await saveGmailDraftForUser({
            userId: context.userId,
            context: context.access,
            messageId,
            draft: { to, subject, body },
          })
        : await createGmailComposeDraftForUser({
            userId: context.userId,
            context: context.access,
            draft: { to, cc: cc || undefined, bcc: bcc || undefined, subject, body },
          });

      if (result.status !== "ready") {
        return failResult({
          status: "needs_configuration",
          summary:
            ("message" in result && result.message) ||
            "Gmail下書き作成に失敗しました",
          errorCode: "automation_integration_required",
          errorMessage: result.status,
          startedAt,
        });
      }

      const draftId = result.gmailDraftId;
      return {
        status: "succeeded",
        startedAt,
        completedAt: new Date().toISOString(),
        summary: "Gmail下書きを作成しました",
        outputBindings: { draftId, to },
        artifacts: [
          {
            id: draftId,
            kind: "draft",
            label: `Gmail下書き: ${subject}`,
            url: null,
            externalId: draftId,
            createdAt: new Date().toISOString(),
            sourceRunId: context.runId,
            sourceStepId: context.step.id,
          },
        ],
        artifactIds: [draftId],
        externalActionIds: [draftId],
        notificationIds: [],
        requestId: ids.requestId,
        diagnosticId: ids.diagnosticId,
        retryable: false,
        errorCode: null,
        errorMessage: null,
        costUsage: { ...emptyCostUsage(), externalCalls: 1 },
      };
    });
  },
};

export const calendarAdapter: AutomationStepAdapter = {
  type: "google_calendar",
  async validateConfiguration() {
    return { ok: true, code: "ok", message: "ok" };
  },
  async execute(context) {
    const startedAt = new Date().toISOString();

    const title =
      (typeof context.step.configuration.title === "string" &&
        context.step.configuration.title.trim()) ||
      context.automationName;
    const startAt =
      typeof context.step.configuration.startAt === "string"
        ? context.step.configuration.startAt
        : new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const endAt =
      typeof context.step.configuration.endAt === "string"
        ? context.step.configuration.endAt
        : new Date(Date.parse(startAt) + 60 * 60 * 1000).toISOString();

    return withExternalIdempotency(context, "calendar_create", async () => {
      await ensureExternalAuthHydrated(context.userId);
      const result = await createCalendarEventForUser({
        userId: context.userId,
        context: context.access,
        event: {
          title,
          startAt,
          endAt,
          description:
            typeof context.step.configuration.description === "string"
              ? context.step.configuration.description
              : context.instructionText,
        },
      });
      const ids = newRequestIds();
      if (result.status !== "ready") {
        return failResult({
          status: "needs_configuration",
          summary: result.message || "カレンダー予定の作成に失敗しました",
          errorCode: "automation_integration_required",
          errorMessage: result.status,
          startedAt,
        });
      }
      const eventId = result.event.id;
      return {
        status: "succeeded",
        startedAt,
        completedAt: new Date().toISOString(),
        summary: "Googleカレンダーに予定を作成しました",
        outputBindings: { eventId },
        artifacts: [
          {
            id: eventId,
            kind: "external",
            label: title,
            url: result.event.htmlLink ?? null,
            externalId: eventId,
            createdAt: new Date().toISOString(),
            sourceRunId: context.runId,
            sourceStepId: context.step.id,
          },
        ],
        artifactIds: [eventId],
        externalActionIds: [eventId],
        notificationIds: [],
        requestId: ids.requestId,
        diagnosticId: ids.diagnosticId,
        retryable: false,
        errorCode: null,
        errorMessage: null,
        costUsage: { ...emptyCostUsage(), externalCalls: 1 },
      };
    });
  },
};

export const wordpressAdapter: AutomationStepAdapter = {
  type: "wordpress",
  async validateConfiguration() {
    return { ok: true, code: "ok", message: "ok" };
  },
  async execute(context) {
    const startedAt = new Date().toISOString();

    const publish = context.step.configuration.status === "publish";
    if (publish && !context.approved) {
      return failResult({
        status: "needs_input",
        summary: "WordPress公開には承認が必要です",
        errorCode: "automation_approval_required",
        errorMessage: "approval required for wordpress publish",
        startedAt,
      });
    }

    const title =
      (typeof context.step.configuration.title === "string" &&
        context.step.configuration.title.trim()) ||
      context.automationName;
    const content =
      (typeof context.step.configuration.content === "string" &&
        context.step.configuration.content.trim()) ||
      context.instructionText ||
      context.freeformNotes;

    return withExternalIdempotency(
      context,
      publish ? "wp_publish" : "wp_draft",
      async () => {
        const result = await createWordPressPostForUser({
          userId: context.userId,
          context: context.access,
          payload: {
            title,
            content,
            status: publish ? "publish" : "draft",
          },
        });
        const ids = newRequestIds();
        if (
          (result.status !== "draft_saved" && result.status !== "posted") ||
          result.postId == null
        ) {
          return failResult({
            status: "needs_configuration",
            summary: result.message || "WordPress投稿に失敗しました",
            errorCode: "automation_integration_required",
            errorMessage: result.status,
            startedAt,
          });
        }
        const postId = String(result.postId);
        return {
          status: "succeeded",
          startedAt,
          completedAt: new Date().toISOString(),
          summary:
            result.status === "posted"
              ? "WordPressへ公開しました"
              : "WordPress下書きを保存しました",
          outputBindings: { postId, link: result.link ?? null },
          artifacts: [
            {
              id: postId,
              kind: result.status === "posted" ? "external" : "draft",
              label: title,
              url: result.link ?? null,
              externalId: postId,
              createdAt: new Date().toISOString(),
              sourceRunId: context.runId,
              sourceStepId: context.step.id,
            },
          ],
          artifactIds: [postId],
          externalActionIds: [postId],
          notificationIds: [],
          requestId: ids.requestId,
          diagnosticId: ids.diagnosticId,
          retryable: false,
          errorCode: null,
          errorMessage: null,
          costUsage: { ...emptyCostUsage(), externalCalls: 1 },
        };
      },
    );
  },
};

export const dropboxAdapter: AutomationStepAdapter = {
  type: "dropbox",
  async validateConfiguration(context) {
    const dest =
      typeof context.step.configuration.saveTarget === "string"
        ? context.step.configuration.saveTarget.trim()
        : "";
    if (!dest) {
      return {
        ok: false,
        code: "insufficient_input",
        message: "Dropboxの保存先フォルダを選択してください",
        needsUserInput: true,
      };
    }
    return { ok: true, code: "ok", message: "ok" };
  },
  async execute(context) {
    const startedAt = new Date().toISOString();

    const parentPath = String(context.step.configuration.saveTarget ?? "").trim();
    const prior =
      context.priorArtifacts.find((a) => a.kind === "deliverable" && a.externalId) ??
      context.priorArtifacts.find((a) => a.kind === "deliverable");

    if (!prior?.externalId && !prior?.id) {
      return failResult({
        status: "needs_input",
        summary: "Dropboxへ送る成果物が前の手順にありません",
        errorCode: "automation_integration_required",
        errorMessage: "prior deliverable artifact required",
        startedAt,
      });
    }

    const deliverableId = prior.externalId ?? prior.id;

    return withExternalIdempotency(context, "dropbox_upload", async () => {
      await ensureExternalAuthHydrated(context.userId);
      const stored = await getStoredDeliverableForUser(
        deliverableId,
        context.userId,
      );
      if (!stored?.buffer || stored.buffer.length === 0) {
        return failResult({
          status: "failed",
          summary: "成果物ファイルを読み込めませんでした",
          errorCode: "automation_run_failed",
          errorMessage: "deliverable buffer missing",
          retryable: true,
          startedAt,
        });
      }

      const result = await uploadDropboxFileForUser({
        userId: context.userId,
        context: context.access,
        fileName: stored.fileName,
        buffer: stored.buffer,
        parentPath,
      });
      const ids = newRequestIds();
      if (result.status !== "ready") {
        return failResult({
          status: "needs_configuration",
          summary: result.message || "Dropboxアップロードに失敗しました",
          errorCode: "automation_integration_required",
          errorMessage: result.status,
          retryable: result.status === "error",
          startedAt,
        });
      }

      const fileId = result.file.id || result.file.path;
      return {
        status: "succeeded",
        startedAt,
        completedAt: new Date().toISOString(),
        summary: "Dropboxへ保存しました",
        outputBindings: {
          path: result.file.path,
          fileId,
        },
        artifacts: [
          {
            id: fileId,
            kind: "external",
            label: result.file.name,
            url: null,
            externalId: fileId,
            createdAt: new Date().toISOString(),
            sourceRunId: context.runId,
            sourceStepId: context.step.id,
          },
        ],
        artifactIds: [fileId],
        externalActionIds: [fileId],
        notificationIds: [],
        requestId: ids.requestId,
        diagnosticId: ids.diagnosticId,
        retryable: false,
        errorCode: null,
        errorMessage: null,
        costUsage: { ...emptyCostUsage(), externalCalls: 1 },
      };
    });
  },
};
