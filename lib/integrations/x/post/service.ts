import "server-only";

import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { ensureFeatureFlagsHydrated } from "@/lib/feature-flags/durable";
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
  claimDueScheduledXPosts,
  listXScheduledPosts,
  saveXScheduledPost,
} from "./schedule-store";
import {
  classifyXPostError,
  markXPostUnknownOutcome,
  scheduleXPostRetry,
  transitionDurableXPostJob,
  type XPostCompletionEvidence,
} from "./durable-x-post-jobs";
import { randomUUID } from "node:crypto";
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
import {
  buildXPostDiagnostic,
  logXPostDiagnostic,
} from "./diagnostics";

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
  await ensureFeatureFlagsHydrated();
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
  runId?: string | null;
  scheduledFor?: string | null;
  discriminator?: string | null;
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

  const { evaluateBillingSnsPost } = await import("@/lib/billing/access");
  const billing = await evaluateBillingSnsPost(input.userId, {
    text: input.text,
  });
  if (billing.denial) {
    return {
      status: "plan_limited",
      message: billing.denial.reason,
      httpStatus: billing.denial.status,
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
    const { createHash } = await import("node:crypto");
    const { executeIdempotentSideEffect } = await import(
      "@/lib/side-effects/execute"
    );
    const text = input.text.trim();
    const contentHash = createHash("sha256").update(text).digest("hex").slice(0, 24);
    const sideEffect = await executeIdempotentSideEffect(
      {
        userId: input.userId,
        provider: "x",
        actionType: "post",
        destination: access.username ?? "x",
        automationId: input.automationId ?? null,
        runId: input.runId ?? null,
        occurrenceKey:
          input.runId ?? input.scheduledFor ?? null,
        discriminator: input.discriminator ?? contentHash,
      },
      async () => {
        const tweet = await createTweet({
          accessToken: access.accessToken,
          text,
        });
        return {
          providerResourceId: tweet.tweetId,
          result: tweet,
          evidence: { provider: "x", contentHash },
        };
      },
    );
    const tweet = sideEffect.result;
    const tweetId = tweet?.tweetId?.trim() ?? "";

    if (!tweetId) {
      const diagnostic = buildXPostDiagnostic({
        userId: input.userId,
        automationId: input.automationId,
        runId: input.runId,
        occurrenceId: input.runId ?? input.scheduledFor,
        failedStage: "completion_gate",
        developerCode: "missing_tweet_id",
        xAccountId: access.username,
      });
      logXPostDiagnostic(diagnostic, { mode: input.mode });
      saveXPostHistoryRecord(
        buildHistoryRecord({
          userId: input.userId,
          text: input.text,
          mode: input.mode,
          status: "failed",
          errorMessage: "X API did not return a tweet id",
          automationId: input.automationId,
          scheduledFor: input.scheduledFor,
          driveFileUrl,
        }),
      );
      await notifyXPostFailed(input.userId, "X API did not return a tweet id", {
        developerCode: "missing_tweet_id",
      });
      return {
        status: "error",
        message: "X API did not return a tweet id",
      };
    }

    if (sideEffect.executed || tweetId) {
      const { recordXPostUsageOnce } = await import(
        "@/lib/billing/usage/external-counters"
      );
      recordXPostUsageOnce({
        userId: input.userId,
        tweetId: tweet.tweetId,
        text,
      });
    }

    const tweetUrl =
      access.username != null
        ? buildTweetUrl(access.username, tweetId)
        : `https://x.com/i/web/status/${tweetId}`;

    const history = saveXPostHistoryRecord(
      buildHistoryRecord({
        userId: input.userId,
        text: input.text,
        mode: input.mode,
        status: "success",
        tweetId,
        tweetUrl,
        automationId: input.automationId,
        scheduledFor: input.scheduledFor,
        driveFileUrl,
      }),
    );

    console.info("[X Post] tweet created", {
      mode: input.mode,
      tweetId,
      tweetUrl,
      automationId: input.automationId ?? null,
      textChars: input.text.trim().length,
      endpoint: "https://api.twitter.com/2/tweets",
    });
    logXPostDiagnostic(
      buildXPostDiagnostic({
        userId: input.userId,
        automationId: input.automationId,
        runId: input.runId,
        occurrenceId: input.runId ?? input.scheduledFor,
        failedStage: null,
        developerCode: "posted",
        externalActionId: tweetId,
        xAccountId: access.username,
      }),
      { mode: input.mode },
    );

    await touchXConnectionLastUsed(input.userId);
    await notifyXPostSuccess(input.userId, input.text.trim(), {
      historyId: history.id,
      tweetUrl,
      postedAt: history.postedAt,
    });

    return { status: "ready", mode: input.mode, history };
  } catch (error) {
    if (error instanceof XApiError) {
      if (error.resolution.reconnectRequired) {
        markXConnectionNeedsReconnect(input.userId, error.message);
      }
      recordXPostFailure(error.resolution.logSummary, "x_post");
      logXPostDiagnostic(
        buildXPostDiagnostic({
          userId: input.userId,
          automationId: input.automationId,
          runId: input.runId,
          occurrenceId: input.runId ?? input.scheduledFor,
          failedStage: error.resolution.reconnectRequired ? "oauth" : "provider",
          developerCode: error.resolution.reconnectRequired
            ? "reconnect_required"
            : "provider_error",
          providerStatus: error.httpStatus,
          xAccountId: access.username,
        }),
      );

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

      await notifyXPostFailed(input.userId, error.message, {
        reconnectRequired: error.resolution.reconnectRequired,
        providerStatus: error.httpStatus,
      });

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

    logXPostDiagnostic(
      buildXPostDiagnostic({
        userId: input.userId,
        automationId: input.automationId,
        runId: input.runId,
        occurrenceId: input.runId ?? input.scheduledFor,
        failedStage: "provider",
        developerCode: "provider_error",
        xAccountId: access.username,
      }),
    );
    await notifyXPostFailed(input.userId, message);

    return { status: "error", message };
  }
}

export async function postTweetNowForUser(input: {
  userId: string;
  text: string;
  context: FeatureAccessContext;
  automationId?: string | null;
  runId?: string | null;
  discriminator?: string | null;
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
    automationId: input.automationId,
    runId: input.runId,
    discriminator: input.discriminator,
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

  const draft = await saveXDraftPost({
    userId: input.userId,
    text: input.text,
    id: input.draftId,
  });

  // Draft / preview path — no external X post. Do not log "tweet created".
  console.info("[X Post] preview generated", {
    mode: "draft",
    draftId: draft.id,
    textChars: input.text.trim().length,
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
    drafts: await listXDraftPosts(input.userId),
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

  const existing = await getXDraftPost(input.userId, input.draftId);
  if (!existing) {
    return { status: "not_found", message: "下書きが見つかりません" };
  }

  await deleteXDraftPost(input.userId, input.draftId);
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

  const scheduled = await saveXScheduledPost({
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

/**
 * P0-5: claim-before-post. Cron is a wake trigger only.
 * Duplicate workers cannot both claim the same due job.
 */
export async function processDueScheduledXPosts(input: {
  resolveContext: (userId: string) => Promise<FeatureAccessContext>;
  workerId?: string;
  limit?: number;
}): Promise<Array<{ scheduledId: string; result: XPostResult }>> {
  const workerId =
    input.workerId?.trim() || `x_sched_${randomUUID().slice(0, 10)}`;
  const claimed = await claimDueScheduledXPosts({
    workerId,
    limit: input.limit ?? 20,
  });
  const results: Array<{ scheduledId: string; result: XPostResult }> = [];

  for (const job of claimed) {
    // Move claimed → posting under owner+worker guard
    try {
      await transitionDurableXPostJob({
        xPostJobId: job.xPostJobId,
        ownerId: job.ownerId,
        toStatus: "posting",
        expectedClaimedBy: workerId,
      });
    } catch {
      results.push({
        scheduledId: job.xPostJobId,
        result: {
          status: "error",
          message: "claim transition failed",
        },
      });
      continue;
    }

    // Already posted (provider id present) — never re-post
    if (job.providerPostId) {
      results.push({
        scheduledId: job.xPostJobId,
        result: {
          status: "error",
          message: "already has providerPostId — skip",
        },
      });
      continue;
    }

    const context = await input.resolveContext(job.ownerId);
    let result: XPostResult;
    try {
      result = await executeTweetPost({
        userId: job.ownerId,
        text: job.content,
        mode: "scheduled",
        context,
        automationId: job.automationId,
        scheduledFor: job.scheduledAt,
      });
    } catch (error) {
      const classified = classifyXPostError(error);
      await scheduleXPostRetry({
        xPostJobId: job.xPostJobId,
        ownerId: job.ownerId,
        workerId,
        errorCode: classified.code,
        errorMessage:
          error instanceof Error ? error.message : "Scheduled post failed",
        delayMs: classified.delayMs * Math.max(1, job.attempt),
        permanent: classified.permanent,
      });
      results.push({
        scheduledId: job.xPostJobId,
        result: {
          status: "error",
          message:
            error instanceof Error ? error.message : "Scheduled post failed",
        },
      });
      continue;
    }

    if (
      result.status === "ready" &&
      result.history?.status === "success" &&
      result.history.tweetId
    ) {
      const postedAt = new Date().toISOString();
      const evidence: XPostCompletionEvidence = {
        xPostJobId: job.xPostJobId,
        ownerId: job.ownerId,
        contentHash: job.contentHash,
        providerPostId: result.history.tweetId,
        providerRequestId: job.providerRequestId,
        postedAt,
        connectionId: job.connectionId,
        providerResponseHash: null,
        diagnosticId: job.diagnosticId ?? `xdiag_${randomUUID().slice(0, 12)}`,
        verifiedAt: postedAt,
      };
      try {
        await transitionDurableXPostJob({
          xPostJobId: job.xPostJobId,
          ownerId: job.ownerId,
          toStatus: "posted",
          expectedClaimedBy: workerId,
          patch: {
            providerPostId: result.history.tweetId,
            postedAt,
            completionEvidence: evidence,
            lastErrorMessage: null,
            claimedBy: null,
            leaseExpiresAt: null,
          },
        });
      } catch (error) {
        // Provider succeeded, DB update failed → unknown_outcome (never auto re-post)
        await markXPostUnknownOutcome({
          xPostJobId: job.xPostJobId,
          ownerId: job.ownerId,
          workerId,
          providerPostId: result.history.tweetId,
          errorMessage:
            error instanceof Error
              ? error.message
              : "provider success but durable update failed",
        });
      }
    } else {
      const message =
        result.status === "validation_failed"
          ? result.message
          : result.status === "ready"
            ? result.history?.errorMessage
            : result.message;
      const classified = classifyXPostError(new Error(message ?? "failed"));
      await scheduleXPostRetry({
        xPostJobId: job.xPostJobId,
        ownerId: job.ownerId,
        workerId,
        errorCode: classified.code,
        errorMessage: message ?? "Scheduled post failed",
        delayMs: classified.delayMs * Math.max(1, job.attempt),
        permanent:
          classified.permanent ||
          result.status === "validation_failed" ||
          result.status === "x_not_connected" ||
          result.status === "feature_disabled",
      });
    }

    results.push({ scheduledId: job.xPostJobId, result });
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
    posts: (await listXScheduledPosts(input.userId)).filter(
      (post) => post.status === "pending",
    ),
  };
}

export { validateTweetText, isTweetTextValid } from "./validate";
export { TEST_POST_PREFIX };
