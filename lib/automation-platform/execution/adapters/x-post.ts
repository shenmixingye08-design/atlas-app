import "server-only";

import type { ExternalAdapter } from "@/lib/automation-platform/execution/adapters/types";
import {
  configMissingInput,
  configString,
  externalSuccess,
  mapProviderFailure,
  mapThrownProviderError,
} from "@/lib/automation-platform/execution/adapters/map-provider-status";
import { resolveAutomationFeatureContext } from "@/lib/automation-platform/execution/adapters/resolve-context";
import { postTweetNowForUser } from "@/lib/integrations/x/post/service";

export const invokeXPostAdapter: ExternalAdapter = async (input) => {
  let text = configString(input.step.configuration, [
    "text",
    "body",
    "content",
    "message",
  ]);
  const hashtags = configString(input.step.configuration, ["hashtags"]);
  if (hashtags && text && !text.includes(hashtags)) {
    text = `${text}\n${hashtags}`;
  }
  if (!text) {
    return configMissingInput("投稿本文が設定されていません");
  }

  try {
    const context = await resolveAutomationFeatureContext(input.userId);
    const result = await postTweetNowForUser({
      userId: input.userId,
      text,
      context,
      automationId: input.automationId,
      runId: input.runId,
      discriminator: input.step.id,
    });

    if (result.status !== "ready") {
      return mapProviderFailure({
        service: "X",
        status: result.status,
        message: result.message,
      });
    }

    const tweetId = result.history?.tweetId?.trim() ?? "";
    if (!tweetId) {
      return {
        ok: false,
        summary: "X投稿IDが取得できませんでした",
        artifacts: [],
        errorCode: "automation_run_failed",
        errorMessage: "external_action_id_required",
        failedStage: "EXTERNAL_PROVIDER_CALL",
        retryable: false,
      };
    }

    return externalSuccess({
      summary: "Xに投稿しました",
      provider: "x",
      operation: "post",
      resourceId: tweetId,
      url: result.history?.tweetUrl ?? null,
      label: "X post",
    });
  } catch (error) {
    return mapThrownProviderError("X", error);
  }
};
