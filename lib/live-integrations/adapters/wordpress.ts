/**
 * Live WordPress adapter — draft / publish / update with categories, tags,
 * featured image, and duplicate prevention.
 */

import "server-only";

import {
  createWordPressPostForUser,
  updateWordPressPostForUser,
} from "@/lib/integrations/wordpress/post/service";
import type { WordPressPostPayload } from "@/lib/integrations/wordpress/types";
import { resolveFeatureAccessContextForUser } from "@/lib/live-integrations/context";
import {
  claimLiveActionOnce,
  fingerprintLiveAction,
} from "@/lib/live-integrations/duplicate";
import { withLiveRetry } from "@/lib/live-integrations/retry";
import { getLiveIntegrationStatus } from "@/lib/live-integrations/status";
import type { LiveAdapterResult } from "@/lib/live-integrations/types";

export type WordPressLiveInput = {
  action: "create" | "update";
  postId?: number;
  payload: WordPressPostPayload;
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

function mapWpFailure(result: {
  status: string;
  message: string;
}): LiveAdapterResult {
  return fail(result.message, {
    errorCode: result.status,
    needsReconnect:
      result.status === "wp_not_connected" || result.status === "auth_failure",
  });
}

function isWpSuccess(status: string): boolean {
  return status === "posted" || status === "draft_saved" || status === "updated";
}

export async function executeWordPressLive(
  userId: string,
  input: WordPressLiveInput,
): Promise<LiveAdapterResult> {
  const status = await getLiveIntegrationStatus(userId, "wordpress");
  if (status.status !== "connected") {
    return fail(status.message, {
      errorCode: status.status,
      needsReconnect: status.status !== "not_connected",
    });
  }

  const fingerprint = fingerprintLiveAction({
    userId,
    service: "wordpress",
    action: `${input.action}:${input.payload.status ?? "draft"}`,
    target: String(input.postId ?? ""),
    content: `${input.payload.title}\n${input.payload.content}`.slice(0, 2000),
  });
  if (input.action === "create") {
    const claim = claimLiveActionOnce(fingerprint);
    if (claim.duplicate) {
      return fail("同じ内容のWordPress投稿が短時間に重複したため停止しました。", {
        errorCode: "duplicate_prevented",
        skippedDuplicate: true,
      });
    }
  }

  const context = await resolveFeatureAccessContextForUser(userId);

  try {
    if (input.action === "update") {
      if (!input.postId) {
        return fail("更新する記事IDがありません", {
          errorCode: "invalid_input",
        });
      }
      const result = await withLiveRetry(
        () =>
          updateWordPressPostForUser({
            userId,
            context,
            postId: input.postId!,
            payload: input.payload,
          }),
        "wordpress.update",
      );
      if (!isWpSuccess(result.status)) return mapWpFailure(result);
      return ok(
        result.message,
        result.postId != null ? String(result.postId) : null,
        result.link ?? null,
      );
    }

    const result = await withLiveRetry(
      () =>
        createWordPressPostForUser({
          userId,
          context,
          payload: input.payload,
        }),
      "wordpress.create",
    );
    if (!isWpSuccess(result.status)) return mapWpFailure(result);
    return ok(
      result.message,
      result.postId != null ? String(result.postId) : null,
      result.link ?? null,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "WordPress処理に失敗しました";
    const auth = /auth|reconnect|unauthorized|401|application.?password/i.test(
      message,
    );
    return fail(message.slice(0, 280), {
      errorCode: auth ? "auth_failed" : "execution_failed",
      needsReconnect: auth,
      retryable: !auth,
    });
  }
}
