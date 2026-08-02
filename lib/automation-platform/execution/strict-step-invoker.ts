/**
 * Production / E2E step invoker — never marks unconnected external actions as success.
 *
 * Live side-effects require AUTOMATION_E2E_LIVE_EXTERNAL=true AND connector env/config.
 * Without those, external steps fail closed (not silent draft success).
 */

import type {
  StepInvoker,
  StepInvokeResult,
} from "@/lib/automation-platform/execution/step-invoker";
import { defaultStepInvoker } from "@/lib/automation-platform/execution/step-invoker";
import { getCapability } from "@/lib/automation-platform/step-registry/registry";
import { executeCalendarLive } from "@/lib/live-integrations/adapters/calendar";
import { executeDropboxLive } from "@/lib/live-integrations/adapters/dropbox";
import { executeGmailLive } from "@/lib/live-integrations/adapters/gmail";
import { executeWordPressLive } from "@/lib/live-integrations/adapters/wordpress";
import { executeXLive } from "@/lib/live-integrations/adapters/x";
import { liveAdapterToStepResult } from "@/lib/live-integrations/map-result";
import { preflightLiveIntegrations } from "@/lib/live-integrations/preflight";
import type { AutomationCapabilityId } from "@/lib/automation-platform/types";

function missingInput(message: string): StepInvokeResult {
  return {
    ok: false,
    summary: message,
    artifacts: [],
    errorCode: "automation_integration_required",
    errorMessage: message,
    needsUserInput: true,
  };
}

function notConnected(service: string): StepInvokeResult {
  return {
    ok: false,
    summary: `${service}連携が未接続のため実行できません`,
    artifacts: [],
    errorCode: "automation_integration_required",
    errorMessage: `${service} is not connected`,
    needsUserInput: true,
  };
}

function liveExternalDisabled(service: string): StepInvokeResult {
  return {
    ok: false,
    summary: `${service}連携のライブ外部実行フラグがOFFです`,
    artifacts: [],
    errorCode: "automation_feature_disabled",
    errorMessage: "AUTOMATION_E2E_LIVE_EXTERNAL is not true",
  };
}

function envConfigured(keys: string[]): boolean {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

function googleAppConfigured(): boolean {
  return envConfigured(["GOOGLE_CLIENT_ID"]) && envConfigured(["GOOGLE_CLIENT_SECRET"]);
}

function xAppConfigured(): boolean {
  return (
    envConfigured(["X_TEST_ACCESS_TOKEN"]) ||
    (envConfigured(["X_CLIENT_ID"]) && envConfigured(["X_CLIENT_SECRET"]))
  );
}

function dropboxAppConfigured(): boolean {
  return (
    envConfigured(["DROPBOX_APP_KEY", "DROPBOX_CLIENT_ID"]) &&
    envConfigured(["DROPBOX_APP_SECRET", "DROPBOX_CLIENT_SECRET"])
  );
}

function wordpressAppConfigured(): boolean {
  return envConfigured(["ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY"]);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

async function preflightOrBlock(
  userId: string,
  capabilityId: AutomationCapabilityId,
): Promise<StepInvokeResult | null> {
  const preflight = await preflightLiveIntegrations({
    userId,
    capabilityIds: [capabilityId],
  });
  if (preflight.ok) return null;
  const issue = preflight.issues[0];
  return {
    ok: false,
    summary: issue?.title ?? "外部連携の事前確認に失敗しました",
    artifacts: [],
    errorCode: "automation_integration_required",
    errorMessage: issue?.description ?? "preflight_blocked",
    needsUserInput: true,
  };
}

/**
 * Strict invoker used by production dispatch and E2E.
 * External steps require connection config + required fields; never silent success.
 */
export const strictStepInvoker: StepInvoker = async (input) => {
  const { step, approved, userId } = input;
  const capability = getCapability(step.type);
  if (!capability) {
    return {
      ok: false,
      summary: "未対応の手順です",
      artifacts: [],
      errorCode: "automation_unsupported_step",
      errorMessage: `Unsupported capability: ${step.type}`,
    };
  }

  if (capability.systemRequiresApproval && !approved) {
    return {
      ok: false,
      summary: "承認が必要です",
      artifacts: [],
      errorCode: "automation_approval_required",
      errorMessage: "高リスク手順は承認後のみ実行できます",
      needsUserInput: true,
    };
  }

  const live = process.env.AUTOMATION_E2E_LIVE_EXTERNAL === "true";
  const cfg = step.configuration;

  switch (step.type) {
    case "gmail": {
      const to = asStringList(cfg.to);
      if (to.length === 0 || to[0] === "（宛先未設定）") {
        return missingInput("メール送信先が設定されていません");
      }
      if (!googleAppConfigured()) return notConnected("Gmail");
      if (!live) return liveExternalDisabled("Gmail");
      const blocked = await preflightOrBlock(userId, "gmail");
      if (blocked) return blocked;

      const modeRaw = asString(cfg.mode).toLowerCase();
      const mode =
        modeRaw === "send" || modeRaw === "reply" ? modeRaw : "draft";
      const result = await executeGmailLive(userId, {
        to,
        cc: asStringList(cfg.cc),
        bcc: asStringList(cfg.bcc),
        subject: asString(cfg.subject) || step.name || "（件名なし）",
        bodyText:
          asString(cfg.bodyText) ||
          asString(cfg.body) ||
          asString(cfg.content) ||
          "",
        bodyHtml: asString(cfg.bodyHtml) || undefined,
        mode,
        signature: asString(cfg.signature) || null,
        messageId: asString(cfg.messageId) || undefined,
        threadId: asString(cfg.threadId) || null,
        attachments: Array.isArray(cfg.attachments)
          ? (cfg.attachments as Array<{
              filename: string;
              mimeType: string;
              contentBase64: string;
            }>)
          : undefined,
      });
      return liveAdapterToStepResult("Gmail", result);
    }
    case "x_post": {
      const text = asString(cfg.text) || asString(cfg.content);
      if (!text) return missingInput("投稿本文が設定されていません");
      if (!xAppConfigured()) return notConnected("X");
      if (!live) return liveExternalDisabled("X");
      const blocked = await preflightOrBlock(userId, "x_post");
      if (blocked) return blocked;

      const result = await executeXLive(userId, {
        text,
        automationId: asString(cfg.automationId) || null,
        imageBase64: asString(cfg.imageBase64) || null,
        imageMimeType: asString(cfg.imageMimeType) || null,
        mode: "auto",
      });
      return liveAdapterToStepResult("X投稿", result);
    }
    case "dropbox": {
      const dest =
        asString(cfg.saveTarget) ||
        asString(cfg.folderPath) ||
        asString(cfg.parentPath);
      if (!dest) {
        return missingInput("Dropboxの保存先フォルダを選択してください");
      }
      if (!dropboxAppConfigured()) return notConnected("Dropbox");
      if (!live) return liveExternalDisabled("Dropbox");
      const blocked = await preflightOrBlock(userId, "dropbox");
      if (blocked) return blocked;

      const fileName =
        asString(cfg.fileName) ||
        asString(cfg.filename) ||
        `${step.name || "deliverable"}.txt`;
      const result = await executeDropboxLive(userId, {
        fileName,
        parentPath: dest,
        contentText:
          asString(cfg.contentText) ||
          asString(cfg.content) ||
          asString(cfg.body) ||
          `Automation artifact: ${input.automationName} / ${input.runId}`,
        contentBase64: asString(cfg.contentBase64) || undefined,
        overwrite: cfg.overwrite === true,
        ensureFolder: cfg.ensureFolder !== false,
      });
      return liveAdapterToStepResult("Dropbox保存", result);
    }
    case "google_calendar": {
      if (!googleAppConfigured()) return notConnected("Google Calendar");
      if (!live) return liveExternalDisabled("Google Calendar");
      const blocked = await preflightOrBlock(userId, "google_calendar");
      if (blocked) return blocked;

      const actionRaw = asString(cfg.action).toLowerCase();
      const action =
        actionRaw === "update" || actionRaw === "delete"
          ? actionRaw
          : "create";
      const title = asString(cfg.title) || step.name || "予定";
      const startAt = asString(cfg.startAt) || asString(cfg.start);
      const endAt = asString(cfg.endAt) || asString(cfg.end);
      if (action !== "delete" && (!startAt || !endAt)) {
        return missingInput("予定の開始・終了日時を設定してください");
      }

      const result = await executeCalendarLive(userId, {
        action,
        eventId: asString(cfg.eventId) || undefined,
        event:
          action === "delete"
            ? undefined
            : {
                title,
                startAt,
                endAt,
                description: asString(cfg.description) || null,
                location: asString(cfg.location) || null,
                remindMinutesBefore:
                  typeof cfg.remindMinutesBefore === "number"
                    ? cfg.remindMinutesBefore
                    : 30,
                timeZone: asString(cfg.timeZone) || asString(cfg.timezone) || null,
                attendees: asStringList(cfg.attendees),
                isAllDay: cfg.isAllDay === true,
                createMeet: cfg.createMeet === true,
              },
      });
      return liveAdapterToStepResult("Google Calendar", result);
    }
    case "wordpress": {
      if (!wordpressAppConfigured()) return notConnected("WordPress");
      if (!live) return liveExternalDisabled("WordPress");
      const blocked = await preflightOrBlock(userId, "wordpress");
      if (blocked) return blocked;

      const title = asString(cfg.title) || step.name || "記事";
      const content =
        asString(cfg.content) || asString(cfg.body) || asString(cfg.bodyHtml);
      if (!content) {
        return missingInput("WordPressの本文が設定されていません");
      }
      const statusRaw = asString(cfg.status).toLowerCase();
      const postStatus = statusRaw === "publish" ? "publish" : "draft";
      const action = asString(cfg.action).toLowerCase() === "update"
        ? "update"
        : "create";
      const categories = Array.isArray(cfg.categories)
        ? cfg.categories.map(Number).filter((n) => Number.isFinite(n))
        : undefined;
      const tags = Array.isArray(cfg.tags)
        ? cfg.tags.map(Number).filter((n) => Number.isFinite(n))
        : undefined;

      const result = await executeWordPressLive(userId, {
        action,
        postId:
          typeof cfg.postId === "number"
            ? cfg.postId
            : Number(asString(cfg.postId)) || undefined,
        payload: {
          title,
          content,
          status: postStatus,
          excerpt: asString(cfg.excerpt) || undefined,
          categories,
          tags,
          featuredImageUrl: asString(cfg.featuredImageUrl) || undefined,
          featuredImageAlt: asString(cfg.featuredImageAlt) || undefined,
        },
      });
      return liveAdapterToStepResult("WordPress", result);
    }
    default:
      return defaultStepInvoker(input);
  }
};
