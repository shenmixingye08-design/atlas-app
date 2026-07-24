import "server-only";

import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import {
  getExternalServiceCredentials,
} from "@/lib/integrations/external-services/credential-store";
import {
  getXAccountAccessToken,
  getXAccountAccessTokenResult,
} from "@/lib/integrations/x/token-manager";
import { touchXConnectionLastUsed, markXConnectionNeedsReconnect } from "@/lib/integrations/x/oauth-service";
import { XApiError, xWriteScopeMissingMessage } from "@/lib/integrations/x/api-error";
import { X_RECONNECT_REQUIRED_MESSAGE } from "@/lib/integrations/x/errors";
import { hasXWriteScope, parseXGrantedScopes } from "@/lib/integrations/x/scopes";
import {
  recordXAuthFailure,
  recordXPostFailure,
} from "@/lib/owner/error-monitoring/telemetry";
import {
  notifyXPostFailed,
  notifyXPostSuccess,
} from "@/lib/notifications/emitters";

import { buildTweetUrl, createTweet, fetchTweetById } from "./api-client";
import {
  deleteXDraftPost,
  getXDraftPost,
  listXDraftPosts,
  saveXDraftPost,
} from "./draft-store";
import { savePostTextToGoogleDriveIfEnabled } from "./drive-backup";
import {
  listXPostHistory,
  saveXPostHistoryRecord,
} from "./history-store";
import {
  listDueXScheduledPosts,
  listXScheduledPosts,
  saveXScheduledPost,
  updateXScheduledPost,
} from "./schedule-store";
import type {
  XDraftPostsResult,
  XPostHistoryRecord,
  XPostHistoryResult,
  XPostLookupResult,
  XPostMode,
  XPostResult,
  XScheduledPostsResult,
} from "./types";
import { validateTweetText } from "./validate";

const TEST_POST_PREFIX = "【MINERVOTテスト投稿】";

async function resolveXPostAccess(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<
  | { status: "ready"; accessToken: string; username: string | null }
  | {
      status: Exclude<XPostResult["status"], "ready" | "validation_failed">;
      message: string;
      reconnectRequired?: boolean;
    }
> {
  if (!isFeatureEnabled("x", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("x"),
    };
  }

  // Hydrate the Supabase-backed source of truth first. On a cold serverless
  // instance the in-memory connection store is empty, so reading it before
  // hydration would wrongly report "x_not_connected" and short-circuit a user
  // who actually has valid tokens persisted in Supabase.
  await ensureExternalAuthHydrated(input.userId);

  const connection = getExternalServiceConnection(input.userId, "x");
  if (connection.status !== "connected") {
    return {
      status: "x_not_connected",
      message:
        connection.status === "error"
          ? connection.errorMessage ?? X_RECONNECT_REQUIRED_MESSAGE
          : "Xを接続してください",
    };
  }

  const tokenResult = await getXAccountAccessTokenResult(input.userId);
  if (tokenResult.status !== "ready") {
    recordXAuthFailure("X access token unavailable", "x_post");
    return {
      status: "x_not_connected",
      message:
        tokenResult.status === "refresh_failed"
          ? tokenResult.message
          : "Xを接続してください",
      reconnectRequired: tokenResult.status === "refresh_failed",
    };
  }

  const credentials = getExternalServiceCredentials(input.userId, "x");
  const scopeSource =
    credentials?.scope?.trim() ? credentials.scope : connection.scopes;
  const grantedScopes = parseXGrantedScopes(scopeSource);
  if (!hasXWriteScope(grantedScopes)) {
    return {
      status: "x_not_connected",
      message: xWriteScopeMissingMessage(),
      reconnectRequired: true,
    };
  }

  const username =
    connection.account?.username ??
    connection.account?.email?.replace(/^@/, "") ??
    null;

  return { status: "ready", accessToken: tokenResult.accessToken, username };
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
    return {
      status: access.status,
      message: access.message,
      reconnectRequired: access.reconnectRequired,
    };
  }

  let driveFileUrl: string | null = null;
  try {
    driveFileUrl = await savePostTextToGoogleDriveIfEnabled({
      userId: input.userId,
      text: input.text.trim(),
      context: input.context,
      fileNamePrefix:
        input.mode === "auto"
          ? "x-auto-post"
          : input.mode === "test"
            ? "x-test-post"
            : "x-post",
    });
  } catch (error) {
    console.warn("[X Post] Drive backup failed");
    if (error instanceof Error) {
      console.warn("[X Post] Drive backup detail:", error.message);
    }
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

    // Safe operational log for Vercel Runtime Logs — never includes tokens.
    console.info("[X Post] tweet created", {
      mode: input.mode,
      tweetId: tweet.tweetId,
      tweetUrl,
      automationId: input.automationId ?? null,
      textChars: input.text.trim().length,
      endpoint: "https://api.twitter.com/2/tweets",
    });

    await touchXConnectionLastUsed(input.userId);
    notifyXPostSuccess(input.userId, input.text.trim(), {
      historyId: history.id,
    });

    return { status: "ready", mode: input.mode, history };
  } catch (error) {
    if (error instanceof XApiError) {
      if (error.resolution.reconnectRequired) {
        markXConnectionNeedsReconnect(input.userId, error.message);
      }
      recordXPostFailure(error.resolution.logSummary, "x_post");

      saveXPostHistoryRecord(
        buildHistoryRecord({
          userId: input.userId,
          text: input.text,
          mode: input.mode,
          status: "failed",
          errorMessage: error.message,
          automationId: input.automationId,
          scheduledFor: input.scheduledFor,
          driveFileUrl,
        }),
      );

      notifyXPostFailed(input.userId, error.message);

      return {
        status: "error",
        message: error.message,
        reconnectRequired: error.resolution.reconnectRequired,
      };
    }

    const message =
      error instanceof Error ? error.message : "Xへの投稿に失敗しました";
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

/** Post a short verification tweet to confirm write permissions. */
export async function postTweetTestForUser(input: {
  userId: string;
  text?: string;
  context: FeatureAccessContext;
}): Promise<XPostResult> {
  if (!isFeatureEnabled("x", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("x"),
    };
  }

  const custom = input.text?.trim();
  const text = custom
    ? custom.startsWith(TEST_POST_PREFIX)
      ? custom
      : `${TEST_POST_PREFIX} ${custom}`
    : `${TEST_POST_PREFIX} ${new Date().toLocaleString("ja-JP")} — 接続確認`;

  return executeTweetPost({
    userId: input.userId,
    text,
    mode: "test",
    context: input.context,
  });
}

export async function saveXDraftForUser(input: {
  userId: string;
  text: string;
  draftId?: string;
  context: FeatureAccessContext;
}): Promise<XPostResult> {
  if (!isFeatureEnabled("x", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("x"),
    };
  }

  const validation = validateTweetText(input.text);
  // Allow empty drafts only when updating existing? Prefer requiring non-empty.
  if (validation.errors.length > 0) {
    return {
      status: "validation_failed",
      message: validation.errors.join(" / "),
      validation,
    };
  }

  const draft = saveXDraftPost({
    userId: input.userId,
    text: input.text,
    id: input.draftId,
  });

  return { status: "ready", mode: "draft", draft };
}

export async function getXDraftPostsForUser(input: {
  userId: string;
  context: FeatureAccessContext;
}): Promise<XDraftPostsResult> {
  if (!isFeatureEnabled("x", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("x"),
    };
  }

  return {
    status: "ready",
    drafts: listXDraftPosts(input.userId),
  };
}

export async function deleteXDraftForUser(input: {
  userId: string;
  draftId: string;
  context: FeatureAccessContext;
}): Promise<
  | { status: "ready" }
  | { status: "feature_disabled"; message: string }
  | { status: "not_found"; message: string }
> {
  if (!isFeatureEnabled("x", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("x"),
    };
  }

  const existing = getXDraftPost(input.userId, input.draftId);
  if (!existing) {
    return { status: "not_found", message: "下書きが見つかりません" };
  }

  deleteXDraftPost(input.userId, input.draftId);
  return { status: "ready" };
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
    return {
      status: access.status,
      message: access.message,
      reconnectRequired: access.reconnectRequired,
    };
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

/** Fetch a single post result by history id (IDOR-safe: user-scoped). */
export async function getXPostResultForUser(input: {
  userId: string;
  historyId: string;
  context: FeatureAccessContext;
  includeLive?: boolean;
}): Promise<XPostLookupResult> {
  if (!isFeatureEnabled("x", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("x"),
    };
  }

  const history = listXPostHistory(input.userId).find(
    (record) => record.id === input.historyId,
  );
  if (!history) {
    return { status: "not_found", message: "投稿結果が見つかりません" };
  }

  if (!input.includeLive || !history.tweetId || history.status !== "success") {
    return { status: "ready", history, liveTweet: null };
  }

  const accessToken = await getXAccountAccessToken(input.userId);
  if (!accessToken) {
    return { status: "ready", history, liveTweet: null };
  }

  try {
    const liveTweet = await fetchTweetById({
      accessToken,
      tweetId: history.tweetId,
    });
    return { status: "ready", history, liveTweet };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "投稿結果の取得に失敗しました";
    return { status: "error", message };
  }
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
    posts: listXScheduledPosts(input.userId).filter(
      (post) => post.status === "pending",
    ),
  };
}

export { validateTweetText, isTweetTextValid } from "./validate";
export { TEST_POST_PREFIX };
