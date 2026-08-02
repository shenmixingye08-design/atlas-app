/**
 * Live X adapter — post / image post, approval-gated by invoker,
 * duplicate prevention, 429 retry, token refresh via existing manager.
 */

import "server-only";

import {
  postTweetAutoForUser,
  postTweetNowForUser,
} from "@/lib/integrations/x/post/service";
import { createTweet } from "@/lib/integrations/x/post/api-client";
import { getXAccountAccessTokenResult } from "@/lib/integrations/x/token-manager";
import { resolveFeatureAccessContextForUser } from "@/lib/live-integrations/context";
import {
  claimLiveActionOnce,
  fingerprintLiveAction,
} from "@/lib/live-integrations/duplicate";
import { withLiveRetry } from "@/lib/live-integrations/retry";
import { getLiveIntegrationStatus } from "@/lib/live-integrations/status";
import type { LiveAdapterResult } from "@/lib/live-integrations/types";
import { uploadXMedia } from "@/lib/live-integrations/adapters/x-media";

export type XLiveInput = {
  text: string;
  automationId?: string | null;
  imageBase64?: string | null;
  imageMimeType?: string | null;
  mode?: "auto" | "now";
};

function fail(
  summary: string,
  opts?: Partial<LiveAdapterResult>,
): LiveAdapterResult {
  return {
    ok: false,
    summary,
    externalId: null,
    url: null,
    errorCode: opts?.errorCode ?? "execution_failed",
    errorMessage: opts?.errorMessage ?? summary,
    needsReconnect: opts?.needsReconnect ?? false,
    retryable: opts?.retryable ?? false,
    skippedDuplicate: opts?.skippedDuplicate ?? false,
  };
}

function ok(
  summary: string,
  externalId: string | null,
  url: string | null = null,
): LiveAdapterResult {
  return {
    ok: true,
    summary,
    externalId,
    url,
    errorCode: null,
    errorMessage: null,
    needsReconnect: false,
    retryable: false,
    skippedDuplicate: false,
  };
}

export async function executeXLive(
  userId: string,
  input: XLiveInput,
): Promise<LiveAdapterResult> {
  const status = await getLiveIntegrationStatus(userId, "x");
  if (status.status !== "connected") {
    return fail(status.message, {
      errorCode: status.status,
      needsReconnect: status.status !== "not_connected",
    });
  }

  const text = input.text.trim();
  if (!text) {
    return fail("投稿本文が設定されていません", { errorCode: "invalid_input" });
  }

  const fingerprint = fingerprintLiveAction({
    userId,
    service: "x",
    action: "post",
    target: "timeline",
    content: text,
  });
  const claim = claimLiveActionOnce(fingerprint);
  if (claim.duplicate) {
    return fail("同じ内容のX投稿が短時間に重複したため停止しました。", {
      errorCode: "duplicate_prevented",
      skippedDuplicate: true,
    });
  }

  const context = await resolveFeatureAccessContextForUser(userId);

  try {
    if (input.imageBase64) {
      const tokenResult = await getXAccountAccessTokenResult(userId);
      if (tokenResult.status !== "ready") {
        return fail(
          tokenResult.status === "refresh_failed"
            ? tokenResult.message
            : "Xの再接続が必要です",
          {
            errorCode: "needs_reconnect",
            needsReconnect: true,
          },
        );
      }
      const mediaId = await withLiveRetry(
        () =>
          uploadXMedia({
            accessToken: tokenResult.accessToken,
            imageBase64: input.imageBase64!,
            mimeType: input.imageMimeType ?? "image/png",
          }),
        "x.media_upload",
      );
      const posted = await withLiveRetry(
        () =>
          createTweet({
            accessToken: tokenResult.accessToken,
            text,
            mediaIds: [mediaId],
          }),
        "x.post_with_media",
      );
      return ok("Xに画像付き投稿しました", posted.tweetId);
    }

    const result = await withLiveRetry(async () => {
      if (input.mode === "now") {
        return postTweetNowForUser({ userId, text, context });
      }
      return postTweetAutoForUser({
        userId,
        text,
        context,
        automationId: input.automationId,
      });
    }, "x.post");

    if (result.status !== "ready") {
      const reconnect =
        ("reconnectRequired" in result && Boolean(result.reconnectRequired)) ||
        result.status === "x_not_connected";
      const retryable = /429|rate.?limit/i.test(result.message);
      return fail(result.message, {
        errorCode: result.status,
        needsReconnect: reconnect,
        retryable: reconnect ? false : retryable,
      });
    }

    const tweetId = result.history?.tweetId ?? null;
    const tweetUrl = result.history?.tweetUrl ?? null;
    return ok("Xに投稿しました", tweetId, tweetUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "X投稿に失敗しました";
    const rate = /429|rate.?limit/i.test(message);
    const auth = /expired|reconnect|unauthorized|401|invalid_grant/i.test(
      message,
    );
    return fail(message.slice(0, 280), {
      errorCode: auth
        ? "auth_failed"
        : rate
          ? "rate_limited"
          : "execution_failed",
      needsReconnect: auth,
      retryable: rate || !auth,
    });
  }
}
