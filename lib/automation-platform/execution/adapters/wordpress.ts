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
import { createWordPressPostForUser } from "@/lib/integrations/wordpress/post/service";

export const invokeWordPressAdapter: ExternalAdapter = async (input) => {
  const title = configString(input.step.configuration, ["title", "eventTitle"]);
  const content = configString(input.step.configuration, [
    "content",
    "body",
    "text",
    "message",
  ]);
  if (!title || !content) {
    return configMissingInput("WordPressのタイトルと本文が必要です");
  }

  const publishMode =
    configString(input.step.configuration, ["publishMode", "status"]) ||
    "draft";
  const status = publishMode === "publish" ? "publish" : "draft";

  try {
    const context = await resolveAutomationFeatureContext(input.userId);
    const result = await createWordPressPostForUser({
      userId: input.userId,
      context,
      payload: { title, content, status },
      automationId: input.automationId,
      runId: input.runId,
      occurrenceKey: input.runId,
      discriminator: input.step.id,
    });

    if (result.status !== "posted" && result.status !== "draft_saved") {
      return mapProviderFailure({
        service: "WordPress",
        status: result.status,
        message: result.message,
      });
    }

    const postId = result.postId != null ? String(result.postId) : "";
    if (!postId) {
      return {
        ok: false,
        summary: "WordPress記事IDが取得できませんでした",
        artifacts: [],
        errorCode: "automation_run_failed",
        errorMessage: "external_action_id_required",
        failedStage: "EXTERNAL_PROVIDER_CALL",
        retryable: false,
      };
    }

    return externalSuccess({
      summary:
        status === "publish"
          ? "WordPressに公開しました"
          : "WordPressに下書き保存しました",
      provider: "wordpress",
      operation: status === "publish" ? "publish" : "draft",
      resourceId: postId,
      url: result.link ?? null,
      label: title,
    });
  } catch (error) {
    return mapThrownProviderError("WordPress", error);
  }
};
