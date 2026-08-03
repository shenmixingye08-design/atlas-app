/**
 * External Live Adapters — call real integration services, fail closed otherwise.
 */

import "server-only";

import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  adapterFailure,
  adapterSuccess,
  type LiveAdapterDefinition,
  type LiveAdapterInvokeInput,
} from "@/lib/automation-platform/execution/live-adapters/types";
import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";

function ctx() {
  return buildFeatureAccessContext(null);
}

function stringConfig(
  configuration: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = configuration[key];
  return typeof value === "string" ? value.trim() : "";
}

async function invokeGmail(
  input: LiveAdapterInvokeInput,
): Promise<StepInvokeResult> {
  const to = stringConfig(input.step.configuration, "to");
  const subject = stringConfig(input.step.configuration, "subject") || input.automationName;
  const body =
    stringConfig(input.step.configuration, "body") ||
    stringConfig(input.step.configuration, "text") ||
    `「${input.automationName}」の自動化結果です。`;
  const messageId = stringConfig(input.step.configuration, "messageId");

  if (!to || to === "（宛先未設定）") {
    return adapterFailure("Gmail", "automation_integration_required", "メール送信先が設定されていません", {
      needsUserInput: true,
      failedStage: "EXTERNAL_INPUT",
    });
  }
  if (!messageId) {
    // Production Gmail path is reply-based; new compose is not inventable as success.
    return adapterFailure(
      "Gmail",
      "automation_integration_required",
      "返信元 messageId が未設定のため送信できません（途中成功禁止）",
      { needsUserInput: true, failedStage: "EXTERNAL_INPUT" },
    );
  }

  try {
    const { sendReplyForUser } = await import(
      "@/lib/integrations/google/gmail/service"
    );
    const result = await sendReplyForUser({
      userId: input.userId,
      context: ctx(),
      messageId,
      draft: { messageId, to, subject, body },
    });
    if (result.status === "ready") {
      return adapterSuccess({
        summary: "Gmail送信が完了しました",
        externalId: result.sentMessageId,
        label: subject,
      });
    }
    return adapterFailure(
      "Gmail",
      result.status === "google_not_connected"
        ? "automation_integration_required"
        : "automation_run_failed",
      result.message,
      {
        needsUserInput: result.status === "google_not_connected",
        retryable: result.status !== "google_not_connected",
      },
    );
  } catch (error) {
    return adapterFailure(
      "Gmail",
      "automation_run_failed",
      error instanceof Error ? error.message : "gmail_send_failed",
      { retryable: true },
    );
  }
}

async function invokeDropbox(
  input: LiveAdapterInvokeInput,
): Promise<StepInvokeResult> {
  const dest =
    stringConfig(input.step.configuration, "saveTarget") ||
    stringConfig(input.step.configuration, "folderPath") ||
    stringConfig(input.step.configuration, "parentPath");
  if (!dest) {
    return adapterFailure(
      "Dropbox",
      "automation_integration_required",
      "Dropboxの保存先フォルダを選択してください",
      { needsUserInput: true, failedStage: "EXTERNAL_INPUT" },
    );
  }

  const deliverableId =
    stringConfig(input.step.configuration, "deliverableId") ||
    input.priorArtifactIds?.[0] ||
    "";
  if (!deliverableId) {
    return adapterFailure(
      "Dropbox",
      "run_artifact_missing",
      "アップロード対象の成果物がありません",
      { failedStage: "EXTERNAL_INPUT" },
    );
  }

  try {
    const { getStoredDeliverableForUser } = await import(
      "@/lib/deliverables/store"
    );
    const file = await getStoredDeliverableForUser(deliverableId, input.userId);
    if (!file?.buffer || file.buffer.byteLength <= 0) {
      return adapterFailure(
        "Dropbox",
        "run_artifact_missing",
        "成果物バイナリを取得できませんでした",
      );
    }
    const { uploadDropboxFileForUser } = await import(
      "@/lib/integrations/dropbox/service"
    );
    const result = await uploadDropboxFileForUser({
      userId: input.userId,
      context: ctx(),
      fileName: file.fileName,
      buffer: Buffer.from(file.buffer),
      parentPath: dest,
    });
    if (result.status === "ready") {
      return adapterSuccess({
        summary: "Dropboxへ保存しました",
        externalId: result.file.id,
        url: result.file.sharedLinkUrl ?? result.file.pathDisplay,
        label: file.fileName,
      });
    }
    return adapterFailure(
      "Dropbox",
      result.status === "dropbox_not_connected"
        ? "automation_integration_required"
        : "automation_run_failed",
      result.message,
      {
        needsUserInput: result.status === "dropbox_not_connected",
        retryable: result.status !== "dropbox_not_connected",
      },
    );
  } catch (error) {
    return adapterFailure(
      "Dropbox",
      "automation_run_failed",
      error instanceof Error ? error.message : "dropbox_upload_failed",
      { retryable: true },
    );
  }
}

async function invokeX(
  input: LiveAdapterInvokeInput,
): Promise<StepInvokeResult> {
  const text = stringConfig(input.step.configuration, "text");
  if (!text) {
    return adapterFailure(
      "X",
      "automation_integration_required",
      "投稿本文が設定されていません",
      { needsUserInput: true, failedStage: "EXTERNAL_INPUT" },
    );
  }
  try {
    const { postTweetNowForUser } = await import(
      "@/lib/integrations/x/post/service"
    );
    const result = await postTweetNowForUser({
      userId: input.userId,
      text,
      context: ctx(),
    });
    if (result.status === "ready") {
      const tweetId = result.history?.tweetId;
      const tweetUrl = result.history?.tweetUrl;
      if (!tweetId || !tweetUrl || result.history?.status !== "success") {
        return adapterFailure(
          "X",
          "automation_run_failed",
          "X投稿の証拠（tweetId/url）がありません — 途中成功禁止",
        );
      }
      return adapterSuccess({
        summary: "Xへ投稿しました",
        externalId: tweetId,
        url: tweetUrl,
        label: "X post",
      });
    }
    return adapterFailure(
      "X",
      result.status === "x_not_connected"
        ? "automation_integration_required"
        : "automation_run_failed",
      result.message,
      {
        needsUserInput: result.status === "x_not_connected",
        retryable:
          result.status !== "x_not_connected" &&
          result.status !== "feature_disabled",
      },
    );
  } catch (error) {
    return adapterFailure(
      "X",
      "automation_run_failed",
      error instanceof Error ? error.message : "x_post_failed",
      { retryable: true },
    );
  }
}

async function invokeDrive(
  input: LiveAdapterInvokeInput,
): Promise<StepInvokeResult> {
  const deliverableId =
    stringConfig(input.step.configuration, "deliverableId") ||
    input.priorArtifactIds?.[0] ||
    "";
  if (!deliverableId) {
    return adapterFailure(
      "Google Drive",
      "run_artifact_missing",
      "アップロード対象の成果物がありません",
    );
  }
  try {
    const { saveDeliverableToGoogleDriveForUser } = await import(
      "@/lib/integrations/google/drive"
    );
    const result = await saveDeliverableToGoogleDriveForUser({
      userId: input.userId,
      context: ctx(),
      deliverableId,
    });
    if (result.status === "ready") {
      if (!result.file.id) {
        return adapterFailure(
          "Google Drive",
          "automation_run_failed",
          "Drive保存の証拠（file id）がありません",
        );
      }
      return adapterSuccess({
        summary: "Google Driveへ保存しました",
        externalId: result.file.id,
        url: result.file.webViewLink ?? result.folderUrl,
        label: result.file.name,
      });
    }
    return adapterFailure(
      "Google Drive",
      result.status === "google_not_connected"
        ? "automation_integration_required"
        : "automation_run_failed",
      result.message,
      {
        needsUserInput: result.status === "google_not_connected",
        retryable: result.status !== "google_not_connected",
      },
    );
  } catch (error) {
    return adapterFailure(
      "Google Drive",
      "automation_run_failed",
      error instanceof Error ? error.message : "drive_upload_failed",
      { retryable: true },
    );
  }
}

async function invokeCalendar(
  input: LiveAdapterInvokeInput,
): Promise<StepInvokeResult> {
  const title =
    stringConfig(input.step.configuration, "title") || input.automationName;
  const startAt = stringConfig(input.step.configuration, "startAt");
  const endAt = stringConfig(input.step.configuration, "endAt");
  if (!startAt || !endAt) {
    return adapterFailure(
      "Google Calendar",
      "automation_integration_required",
      "開始・終了時刻が未設定です",
      { needsUserInput: true, failedStage: "EXTERNAL_INPUT" },
    );
  }
  try {
    const { createCalendarEventForUser } = await import(
      "@/lib/integrations/google/calendar/service"
    );
    const result = await createCalendarEventForUser({
      userId: input.userId,
      context: ctx(),
      event: {
        title,
        startAt,
        endAt,
        description:
          stringConfig(input.step.configuration, "description") || undefined,
        location: stringConfig(input.step.configuration, "location") || undefined,
      },
    });
    if (result.status === "ready") {
      if (!result.event.id) {
        return adapterFailure(
          "Google Calendar",
          "automation_run_failed",
          "カレンダー作成の証拠（event id）がありません",
        );
      }
      return adapterSuccess({
        summary: "Google Calendarに登録しました",
        externalId: result.event.id,
        url: result.event.htmlLink,
        label: title,
      });
    }
    return adapterFailure(
      "Google Calendar",
      result.status === "google_not_connected"
        ? "automation_integration_required"
        : "automation_run_failed",
      result.message,
      {
        needsUserInput: result.status === "google_not_connected",
        retryable: result.status !== "google_not_connected",
      },
    );
  } catch (error) {
    return adapterFailure(
      "Google Calendar",
      "automation_run_failed",
      error instanceof Error ? error.message : "calendar_create_failed",
      { retryable: true },
    );
  }
}

async function invokeWordpress(
  input: LiveAdapterInvokeInput,
): Promise<StepInvokeResult> {
  const title =
    stringConfig(input.step.configuration, "title") || input.automationName;
  const content =
    stringConfig(input.step.configuration, "content") ||
    stringConfig(input.step.configuration, "body");
  if (!content) {
    return adapterFailure(
      "WordPress",
      "automation_integration_required",
      "投稿本文が未設定です",
      { needsUserInput: true, failedStage: "EXTERNAL_INPUT" },
    );
  }
  try {
    const { createWordPressPostForUser } = await import(
      "@/lib/integrations/wordpress/post/service"
    );
    const result = await createWordPressPostForUser({
      userId: input.userId,
      context: ctx(),
      payload: {
        title,
        content,
        status:
          stringConfig(input.step.configuration, "status") === "publish"
            ? "publish"
            : "draft",
      },
    });
    if (result.status !== "posted" && result.status !== "draft_saved") {
      return adapterFailure(
        "WordPress",
        result.status === "wp_not_connected"
          ? "automation_integration_required"
          : "automation_run_failed",
        result.message || result.status,
        {
          needsUserInput: result.status === "wp_not_connected",
          retryable:
            result.status !== "wp_not_connected" &&
            result.status !== "feature_disabled",
        },
      );
    }
    if (result.postId == null) {
      return adapterFailure(
        "WordPress",
        "automation_run_failed",
        "WordPress公開の証拠（post id）がありません",
      );
    }
    return adapterSuccess({
      summary: result.message || "WordPressへ投稿しました",
      externalId: String(result.postId),
      url: result.link ?? null,
      label: title,
    });
  } catch (error) {
    return adapterFailure(
      "WordPress",
      "automation_run_failed",
      error instanceof Error ? error.message : "wordpress_publish_failed",
      { retryable: true },
    );
  }
}

async function invokeLine(
  input: LiveAdapterInvokeInput,
): Promise<StepInvokeResult> {
  const message =
    stringConfig(input.step.configuration, "message") ||
    stringConfig(input.step.configuration, "text") ||
    `「${input.automationName}」が完了しました。`;
  const title =
    stringConfig(input.step.configuration, "title") || input.automationName;
  try {
    const { dispatchLineNotification } = await import(
      "@/lib/integrations/line/service"
    );
    const result = await dispatchLineNotification({
      userId: input.userId,
      event: "automation_completed",
      title,
      message,
      actionUrl: `/automations/runs/${encodeURIComponent(input.runId)}`,
    });
    if (!result.sent) {
      return adapterFailure(
        "LINE",
        result.reason === "not_linked" || result.reason === "not_configured"
          ? "automation_integration_required"
          : "automation_run_failed",
        result.reason ?? "line_send_failed",
        {
          needsUserInput:
            result.reason === "not_linked" || result.reason === "not_configured",
        },
      );
    }
    const externalId = `line_${input.runId}_${Date.now()}`;
    return adapterSuccess({
      summary: "LINE通知を送信しました",
      externalId,
      label: title,
    });
  } catch (error) {
    return adapterFailure(
      "LINE",
      "automation_run_failed",
      error instanceof Error ? error.message : "line_send_failed",
      { retryable: true },
    );
  }
}

function unwiredStub(service: string): LiveAdapterDefinition["invoke"] {
  return async () =>
    adapterFailure(
      service,
      "live_adapter_missing",
      `${service}_live_adapter_not_wired`,
      { failedStage: "EXTERNAL_ADAPTER_RESOLUTION" },
    );
}

export const EXTERNAL_LIVE_ADAPTERS: readonly LiveAdapterDefinition[] = [
  {
    id: "google_gmail",
    serviceLabel: "Gmail",
    wired: true,
    invoke: invokeGmail,
  },
  {
    id: "dropbox",
    serviceLabel: "Dropbox",
    wired: true,
    invoke: invokeDropbox,
  },
  {
    id: "x",
    serviceLabel: "X",
    wired: true,
    invoke: invokeX,
  },
  {
    id: "google_drive",
    serviceLabel: "Google Drive",
    wired: true,
    invoke: invokeDrive,
  },
  {
    id: "google_calendar",
    serviceLabel: "Google Calendar",
    wired: true,
    invoke: invokeCalendar,
  },
  {
    id: "wordpress",
    serviceLabel: "WordPress",
    wired: true,
    invoke: invokeWordpress,
  },
  {
    id: "line",
    serviceLabel: "LINE",
    wired: true,
    invoke: invokeLine,
  },
  {
    id: "slack",
    serviceLabel: "Slack",
    wired: false,
    invoke: unwiredStub("Slack"),
  },
  {
    id: "discord",
    serviceLabel: "Discord",
    wired: false,
    invoke: unwiredStub("Discord"),
  },
  {
    id: "notion",
    serviceLabel: "Notion",
    wired: false,
    invoke: unwiredStub("Notion"),
  },
];
