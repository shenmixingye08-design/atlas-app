import "server-only";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { postTweetNowForUser } from "@/lib/integrations/x/post/service";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import { assertPublishableCopy } from "./claims";
import { canPublishNow } from "./publish-policy";
import type { RevenueContent, RevenueGoals } from "./types";

export { canPublishNow };

export async function publishRevenueItemToX(input: {
  item: RevenueContent;
  goals: RevenueGoals;
  userId: string;
}): Promise<RevenueContent> {
  const now = new Date().toISOString();
  const item = { ...input.item };

  if (item.platform !== "x") {
    return {
      ...item,
      lastError: "X以外は自動投稿しません。手動投稿済みに変更してください。",
      updatedAt: now,
    };
  }

  if (!canPublishNow(item)) {
    return {
      ...item,
      lastError: "承認済み、または投稿時刻を過ぎた予約だけ実行できます。",
      updatedAt: now,
    };
  }

  assertPublishableCopy([item.body, item.cta], input.goals);

  item.attemptCount += 1;

  const context = await resolveFeatureAccessContext();
  const result = await postTweetNowForUser({
    userId: input.userId,
    text: item.body,
    context,
    discriminator: item.idempotencyKey,
  });

  if (result.status === "x_not_connected") {
    return {
      ...item,
      status: "failed",
      lastError: result.message,
      updatedAt: now,
    };
  }

  if (result.status !== "ready") {
    const message =
      "message" in result ? result.message : "X投稿に失敗しました";
    const failed =
      item.attemptCount >= item.maxAttempts ? "failed" : item.status;
    return {
      ...item,
      status: failed === "failed" ? "failed" : item.status,
      lastError: message,
      updatedAt: now,
    };
  }

  const tweetId = result.history?.tweetId?.trim() ?? "";
  const tweetUrl = result.history?.tweetUrl?.trim() ?? null;
  if (!tweetId) {
    // Dev mock / incomplete API must not become published.
    const reason = isAtlasProduction()
      ? "Xの投稿IDが返りませんでした。公開済みにしません。"
      : "開発環境で投稿IDが無いため、本番成功としては保存しません。";
    return {
      ...item,
      status: "failed",
      lastError: reason,
      updatedAt: now,
    };
  }

  return {
    ...item,
    status: "published",
    publishedAt: now,
    xTweetId: tweetId,
    postUrl: tweetUrl ?? `https://x.com/i/web/status/${tweetId}`,
    lastError: null,
    updatedAt: now,
  };
}
