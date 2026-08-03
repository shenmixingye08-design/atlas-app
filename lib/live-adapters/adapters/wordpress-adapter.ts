import "server-only";

import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import { checkWordPressConnectionForUser } from "@/lib/integrations/wordpress/connection-status";
import { createWordPressPostForUser } from "@/lib/integrations/wordpress/post/service";

import { hashContent } from "../idempotency";
import { buildExecutionResult } from "../result";
import type {
  AdapterExecuteInput,
  LiveIntegrationAdapter,
  ValidationResult,
} from "../types";
import {
  failValidation,
  okValidation,
  standardIdempotencyKey,
  withAdapterGuards,
} from "./shared";

async function validateWordpress(userId: string): Promise<ValidationResult> {
  const result = await checkWordPressConnectionForUser({
    userId,
    context: buildFeatureAccessContext(null),
  });
  if (!result.connected) {
    return failValidation(
      result.status === "feature_disabled"
        ? "needs_configuration"
        : "needs_connection",
      result.message,
    );
  }
  return okValidation("WordPress接続済み");
}

export const wordpressLiveAdapter: LiveIntegrationAdapter = {
  id: "live.wordpress.publish",
  service: "wordpress",
  mode: "production",
  availability: "available",
  classification: "production_live",
  requiresExternalActionId: true,
  validateConnection: validateWordpress,
  validatePermissions: validateWordpress,
  async execute(input: AdapterExecuteInput) {
    const title =
      typeof input.configuration.title === "string"
        ? input.configuration.title.trim()
        : "ATLAS投稿";
    const content =
      typeof input.configuration.content === "string"
        ? input.configuration.content.trim()
        : typeof input.configuration.body === "string"
          ? input.configuration.body.trim()
          : "";
    const publish =
      input.approved &&
      (input.configuration.status === "publish" ||
        input.configuration.mode === "publish");
    const contentHash = input.contentHash ?? hashContent(`${title}\n${content}`);
    const key = standardIdempotencyKey("wordpress", {
      ...input,
      contentHash,
    });

    return withAdapterGuards({
      adapter: this,
      executeInput: input,
      idempotencyKey: key,
      run: async () => {
        const startedAt = new Date().toISOString();
        if (!title || !content) {
          return buildExecutionResult({
            status: "failed",
            startedAt,
            errorCode: "validation_failed",
            summary: "WordPressのタイトルまたは本文が不足しています",
            requiresExternalActionId: false,
          });
        }
        if (publish && !input.approved) {
          return buildExecutionResult({
            status: "needs_approval",
            startedAt,
            errorCode: "automation_approval_required",
            summary: "WordPress公開には承認が必要です",
            requiresExternalActionId: false,
          });
        }

        const result = await createWordPressPostForUser({
          userId: input.userId,
          context: buildFeatureAccessContext(null),
          payload: {
            title,
            content,
            status: publish ? "publish" : "draft",
            categories: Array.isArray(input.configuration.categories)
              ? input.configuration.categories.filter(
                  (v): v is number => typeof v === "number",
                )
              : undefined,
            tags: Array.isArray(input.configuration.tags)
              ? input.configuration.tags.filter(
                  (v): v is number => typeof v === "number",
                )
              : undefined,
          },
        });

        if (
          (result.status !== "posted" && result.status !== "draft_saved") ||
          !result.postId
        ) {
          return buildExecutionResult({
            status:
              result.status === "feature_disabled"
                ? "needs_configuration"
                : result.status === "wp_not_connected"
                  ? "needs_connection"
                  : "failed",
            startedAt,
            errorCode: result.status,
            summary: result.message,
            requiresExternalActionId: false,
            costUsage: { providerCalls: 1 },
          });
        }

        const postId = String(result.postId);
        const link = result.link ?? null;
        if (publish && !link) {
          return buildExecutionResult({
            status: "failed",
            startedAt,
            externalActionId: postId,
            errorCode: "missing_external_url",
            summary: "WordPress公開URLが取得できませんでした",
            requiresExternalActionId: false,
            costUsage: { providerCalls: 1 },
          });
        }

        return buildExecutionResult({
          status: "succeeded",
          externalActionId: postId,
          externalUrl: link,
          startedAt,
          summary: link
            ? `WordPressへ${publish ? "公開" : "下書き保存"}しました: ${link}`
            : `WordPress下書きを保存しました（postId=${postId}）`,
          requiresExternalActionId: true,
          metadata: {
            postStatus: result.postStatus ?? null,
            mode: publish ? "publish" : "draft",
          },
          costUsage: { providerCalls: 1 },
        });
      },
    });
  },
};
