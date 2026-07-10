import "server-only";

import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { getXAccountAccessToken } from "@/lib/integrations/x/oauth-service";
import {
  recordXAuthFailure,
  recordXPostFailure,
} from "@/lib/owner/error-monitoring/telemetry";
import {
  notifyXPostFailed,
  notifyXPostSuccess,
} from "@/lib/notifications/emitters";

import { buildTweetUrl, createTweet } from "./api-client";
import { savePostTextToGoogleDriveIfEnabled } from "./drive-backup";
import { listXPostHistory, saveXPostHistoryRecord } from "./history-store";
import {
  listDueXScheduledPosts,
  listXScheduledPosts,
  saveXScheduledPost,
  updateXScheduledPost,
} from "./schedule-store";
import type {
  XPostHistoryRecord,
  XPostHistoryResult,
  XPostMode,
  XPostResult,
  XScheduledPostsResult,
} from "./types";
import { validateTweetText } from "./validate";

async function resolveXPostAccess(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<
  | { status: "ready"; accessToken: string; username: string | null }
  | { status: Exclude<XPostResult["status"], "ready" | "validation_failed">; message: string }
> {
  if (!isFeatureEnabled("x", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("x"),
    };
  }

  const connection = getExternalServiceConnection(input.userId, "x");
  if (connection.status !== "connected") {
    return {
      status: "x_not_connected",
      message: "Xを接続してください",
    };
  }

  const accessToken = await getXAccountAccessToken(input.userId);
  if (!accessToken) {
    recordXAuthFailure("X access token unavailable", "x_post");
    return {
      status: "x_not_connected",
      message: "Xを接続してください",
    };
  }

  const username =
    connection.account?.username ??
    connection.account?.email?.replace(/^@/, "") ??
    null;

  return { status: "ready", accessToken, username };
}

function buildHistoryRecord(input: {
  userId: string;
  text: string;
  mode: XPostMode;
  status: "success" | "failed";
  tweetId?: string | null;
  tweetUrl?: string | null;
  errorMessage?: string | null;
  scheduledFor?: string | null;
  automationId?: string | null;
  driveFileUrl?: string | null;
}): XPostHistoryRecord {
  return {
    id: crypto.randomUUID(),
    userId: input.userId,
    text: input.text.trim(),
    mode: input.mode,
    status: input.status,
    postedAt: new Date().toISOString(),
    tweetId: input.tweetId ?? null,
    tweetUrl: input.tweetUrl ?? null,
    errorMessage: input.errorMessage ?? null,
    scheduledFor: input.scheduledFor ?? null,
    automationId: input.automationId ?? null,
    validation: validateTweetText(input.text),
    driveFileUrl: input.driveFileUrl ?? null,
  };
}

async function executeTweetPost(input: {
  userId: string;
  text: string;
  mode: XPostMode;
  context: FeatureAccessContext;
  automationId?: string | null;
  scheduledFor?: string | null;
}): Promise<XPostResult> {
  const validation = validateTweetText(input.text);
  if (validation.errors.length > 0) {
    saveXPostHistoryRecord(
      buildHistoryRecord({
        userId: input.userId,
        text: input.text,
        mode: input.mode,
        status: "failed",
        errorMessage: validation.errors.join(" / "),
        automationId: input.automationId,
        scheduledFor: input.scheduledFor,
      }),
    );

    return {
      status: "validation_failed",
      message: validation.errors.join(" / "),
      validation,
    };
  }

  const access = await resolveXPostAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  let driveFileUrl: string | null = null;
  try {
    driveFileUrl = await savePostTextToGoogleDriveIfEnabled({
      userId: input.userId,
      text: input.text.trim(),
      context: input.context,
      fileNamePrefix: input.mode === "auto" ? "x-auto-post" : "x-post",
    });
  } catch (error) {
    console.warn("[X Post] Drive backup failed:", error);
  }

  try {
    const tweet = await createTweet({
      accessToken: access.accessToken,
      text: input.text.trim(),
    });

    const tweetUrl =
      access.username != null
        ? buildTweetUrl(access.username, tweet.tweetId)
        : `https://x.com/i/web/status/${tweet.tweetId}`;

    const history = saveXPostHistoryRecord(
      buildHistoryRecord({
        userId: input.userId,
        text: input.text,
        mode: input.mode,
        status: "success",
        tweetId: tweet.tweetId,
        tweetUrl,
        automationId: input.automationId,
        scheduledFor: input.scheduledFor,
        driveFileUrl,
      }),
    );

    notifyXPostSuccess(input.userId, input.text.trim());

    return { status: "ready", mode: input.mode, history };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Xへの投稿に失敗しました";
    recordXPostFailure(message, "x_post");

    saveXPostHistoryRecord(
      buildHistoryRecord({
        userId: input.userId,
        text: input.text,
        mode: input.mode,
        status: "failed",
        errorMessage: message,
        automationId: input.automationId,
        scheduledFor: input.scheduledFor,
        driveFileUrl,
      }),
    );

    notifyXPostFailed(input.userId, message);

    return { status: "error", message };
  }
}

export async function postTweetNowForUser(input: {
  userId: string;
  text: string;
  context: FeatureAccessContext;
}): Promise<XPostResult> {
  if (!isFeatureEnabled("x", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("x"),
    };
  }

  return executeTweetPost({
    userId: input.userId,
    text: input.text,
    mode: "immediate",
    context: input.context,
  });
}

export async function scheduleTweetForUser(input: {
  userId: string;
  text: string;
  scheduledFor: string;
  context: FeatureAccessContext;
  automationId?: string | null;
}): Promise<XPostResult> {
  if (!isFeatureEnabled("x", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("x"),
    };
  }

  const validation = validateTweetText(input.text);
  if (validation.errors.length > 0) {
    return {
      status: "validation_failed",
      message: validation.errors.join(" / "),
      validation,
    };
  }

  const access = await resolveXPostAccess(input);
  if (access.status !== "ready") {
    return { status: access.status, message: access.message };
  }

  const scheduledForMs = new Date(input.scheduledFor).getTime();
  if (Number.isNaN(scheduledForMs)) {
    return { status: "error", message: "予約日時が不正です" };
  }

  if (scheduledForMs <= Date.now()) {
    return { status: "error", message: "予約日時は未来の日時を指定してください" };
  }

  const scheduled = saveXScheduledPost({
    userId: input.userId,
    text: input.text,
    scheduledFor: new Date(scheduledForMs).toISOString(),
    automationId: input.automationId,
  });

  return {
    status: "ready",
    mode: "scheduled",
    scheduled,
  };
}

export async function postTweetAutoForUser(input: {
  userId: string;
  text: string;
  context: FeatureAccessContext;
  automationId?: string | null;
}): Promise<XPostResult> {
  return executeTweetPost({
    userId: input.userId,
    text: input.text,
    mode: "auto",
    context: input.context,
    automationId: input.automationId,
  });
}

export async function processDueScheduledXPosts(input: {
  resolveContext: (userId: string) => Promise<FeatureAccessContext>;
}): Promise<Array<{ scheduledId: string; result: XPostResult }>> {
  const due = listDueXScheduledPosts();
  const results: Array<{ scheduledId: string; result: XPostResult }> = [];

  for (const item of due) {
    const context = await input.resolveContext(item.userId);
    const result = await executeTweetPost({
      userId: item.userId,
      text: item.text,
      mode: "scheduled",
      context,
      automationId: item.automationId,
      scheduledFor: item.scheduledFor,
    });

    if (result.status === "ready" && result.history?.status === "success") {
      updateXScheduledPost(item.id, { status: "posted", errorMessage: null });
    } else {
      const message =
        result.status === "validation_failed"
          ? result.message
          : result.status === "ready"
            ? result.history?.errorMessage
            : result.message;
      updateXScheduledPost(item.id, {
        status: "failed",
        errorMessage: message ?? "Scheduled post failed",
      });
    }

    results.push({ scheduledId: item.id, result });
  }

  return results;
}

export async function getXPostHistoryForUser(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<XPostHistoryResult> {
  if (!isFeatureEnabled("x", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("x"),
    };
  }

  return {
    status: "ready",
    records: listXPostHistory(input.userId),
  };
}

export async function getXScheduledPostsForUser(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<XScheduledPostsResult> {
  if (!isFeatureEnabled("x", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("x"),
    };
  }

  return {
    status: "ready",
    posts: listXScheduledPosts(input.userId).filter((post) => post.status === "pending"),
  };
}

export { validateTweetText, isTweetTextValid } from "./validate";
