import "server-only";

import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import { checkXConnectionForUser } from "@/lib/integrations/x/connection-status";
import { postTweetNowForUser } from "@/lib/integrations/x/post/service";

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

async function validateX(userId: string): Promise<ValidationResult> {
  const result = await checkXConnectionForUser({
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
  return okValidation("X接続済み");
}

export const xLiveAdapter: LiveIntegrationAdapter = {
  id: "live.x.post",
  service: "x",
  mode: "production",
  availability: "available",
  classification: "production_live",
  requiresExternalActionId: true,
  validateConnection: validateX,
  validatePermissions: validateX,
  async execute(input: AdapterExecuteInput) {
    const text =
      typeof input.configuration.text === "string"
        ? input.configuration.text.trim()
        : "";
    const contentHash = input.contentHash ?? hashContent(text);
    const key = standardIdempotencyKey("x", { ...input, contentHash }, {
      account: input.userId,
    });

    return withAdapterGuards({
      adapter: this,
      executeInput: input,
      idempotencyKey: key,
      run: async () => {
        const startedAt = new Date().toISOString();
        if (!text) {
          return buildExecutionResult({
            status: "failed",
            startedAt,
            errorCode: "validation_failed",
            summary: "投稿本文が空です",
            requiresExternalActionId: false,
          });
        }
        if (!input.approved) {
          return buildExecutionResult({
            status: "needs_approval",
            startedAt,
            errorCode: "automation_approval_required",
            summary: "X投稿には承認が必要です",
            requiresExternalActionId: false,
          });
        }

        const result = await postTweetNowForUser({
          userId: input.userId,
          text,
          context: buildFeatureAccessContext(null),
        });

        if (result.status !== "ready") {
          return buildExecutionResult({
            status:
              result.status === "feature_disabled"
                ? "needs_configuration"
                : result.status === "x_not_connected"
                  ? "needs_connection"
                  : "failed",
            startedAt,
            errorCode: result.status,
            summary: result.message,
            requiresExternalActionId: false,
            costUsage: { providerCalls: 1 },
          });
        }

        const tweetId = result.history?.tweetId ?? null;
        const tweetUrl = result.history?.tweetUrl ?? null;
        if (!tweetId || !tweetUrl) {
          return buildExecutionResult({
            status: "failed",
            startedAt,
            errorCode: "missing_external_action_id",
            summary: "X投稿ID/URLが取得できませんでした",
            requiresExternalActionId: false,
            costUsage: { providerCalls: 1 },
          });
        }

        return buildExecutionResult({
          status: "succeeded",
          externalActionId: tweetId,
          externalUrl: tweetUrl,
          startedAt,
          summary: `Xに投稿しました: ${tweetUrl}`,
          requiresExternalActionId: true,
          metadata: { provider: "x" },
          costUsage: { providerCalls: 1 },
        });
      },
    });
  },
};
