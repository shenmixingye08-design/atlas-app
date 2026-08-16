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
import {
  classifyXPostContent,
  X_POST_GENERATION_FAILED_CODE,
  X_POST_GENERATION_FAILED_MESSAGE,
  X_POST_MISSING_CONTENT_MESSAGE,
} from "@/lib/automation-platform/execution/x-post-content";
import {
  generateXAutomationPostText,
  readPreparedXPostText,
} from "@/lib/automation-platform/execution/x-post-generate";
import { applyMemoryToStepBody } from "@/lib/memory-apply/step-body";
import { postTweetNowForUser } from "@/lib/integrations/x/post/service";
import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";

function generationFailedResult(): StepInvokeResult {
  return {
    ok: false,
    summary: X_POST_GENERATION_FAILED_MESSAGE,
    artifacts: [],
    errorCode: "automation_run_failed",
    errorMessage: X_POST_GENERATION_FAILED_CODE,
    failedStage: "CONTENT_GENERATION",
    retryable: true,
    needsUserInput: false,
  };
}

export const invokeXPostAdapter: ExternalAdapter = async (input) => {
  const classification = classifyXPostContent({
    configuration: input.step.configuration,
    freeformNotes: input.freeformNotes,
    automationName: input.automationName,
    resolvedNotes: input.resolvedInstruction?.freeformNotes,
  });

  let text = "";
  if (classification.mode === "fixed") {
    text = classification.text;
  } else if (classification.mode === "generate") {
    text = readPreparedXPostText({
      generatedXPostText: input.generatedXPostText,
      resolvedMerged: input.resolvedInstruction?.merged,
    });
    if (!text) {
      const generated = await generateXAutomationPostText({
        classification,
        automationName: input.automationName,
        memoryInjection:
          typeof input.resolvedInstruction?.merged.memoryInjectionText ===
          "string"
            ? input.resolvedInstruction.merged.memoryInjectionText
            : null,
      });
      if (!generated.ok) {
        return generationFailedResult();
      }
      text = generated.text;
    }
  } else {
    return configMissingInput(X_POST_MISSING_CONTENT_MESSAGE);
  }

  const hashtags = configString(input.step.configuration, ["hashtags"]);
  if (hashtags && text && !text.includes(hashtags)) {
    text = `${text}\n${hashtags}`;
  }
  if (text) {
    const applied = await applyMemoryToStepBody({
      userId: input.userId,
      channel: "x_post",
      baseline: text,
      automationId: input.automationId,
      assignment: input.automationName,
    });
    text = applied.text;
  }
  if (!text) {
    if (classification.mode === "generate") {
      return generationFailedResult();
    }
    return configMissingInput(X_POST_MISSING_CONTENT_MESSAGE);
  }

  try {
    const context = await resolveAutomationFeatureContext(input.userId);
    const result = await postTweetNowForUser({
      userId: input.userId,
      text,
      context,
      automationId: input.automationId,
      // Prefer stable occurrence when available (safe-retry across run ids).
      runId: input.occurrenceKey ?? input.runId,
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
