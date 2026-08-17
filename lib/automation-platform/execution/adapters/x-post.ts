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
  readStoredXPostText,
  readXPostContentSource,
  shouldRequestXPostUserInput,
  X_POST_GENERATION_FAILED_CODE,
  X_POST_GENERATION_FAILED_MESSAGE,
  X_POST_MISSING_CONTENT_MESSAGE,
} from "@/lib/automation-platform/execution/x-post-content";
import { logXPostInstructionTrace } from "@/lib/automation-platform/execution/x-post-instruction-trace";
import {
  generateXAutomationPostText,
  readPreparedXPostText,
} from "@/lib/automation-platform/execution/x-post-generate";
import {
  allowsFixedTextHashtagAuto,
  applyXAutomationPostHashtags,
} from "@/lib/automation-platform/execution/x-post-hashtags";
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
  const resumeNotes =
    typeof input.resolvedInstruction?.merged.resumeNotes === "string"
      ? input.resolvedInstruction.merged.resumeNotes
      : null;
  const classification = classifyXPostContent({
    configuration: input.step.configuration,
    structuredOptions: {
      ...(input.resolvedInstruction?.structuredOptions ?? {}),
      ...(typeof input.resolvedInstruction?.merged.originalUserRequest ===
      "string"
        ? {
            originalUserRequest:
              input.resolvedInstruction.merged.originalUserRequest,
          }
        : {}),
    },
    freeformNotes: input.freeformNotes,
    description:
      typeof input.resolvedInstruction?.merged.description === "string"
        ? input.resolvedInstruction.merged.description
        : null,
    automationName: input.automationName,
    resolvedNotes: input.resolvedInstruction?.freeformNotes,
    resumeNotes,
  });

  let text = "";
  const preparedText = readPreparedXPostText({
    generatedXPostText: input.generatedXPostText,
    resolvedMerged: input.resolvedInstruction?.merged,
  });
  const originalPresent = Boolean(
    input.resolvedInstruction?.structuredOptions?.originalUserRequest ||
      input.resolvedInstruction?.merged.originalUserRequest,
  );
  const memoryUsed = Boolean(
    input.resolvedInstruction?.merged.memoryInjectionText,
  );
  logXPostInstructionTrace({
    stage: "classify",
    automationId: input.automationId,
    runId: input.runId,
    executionId: input.runId,
    contentSource:
      classification.mode === "generate"
        ? "generate"
        : classification.mode === "fixed"
          ? "fixed"
          : "unresolved",
    originalUserRequestPresent: originalPresent,
    generateInstructionPresent: Boolean(
      input.step.configuration.generateInstruction,
    ),
    resolvedGenerateInstructionPresent: Boolean(
      classification.generateInstruction,
    ),
    configurationTextEmpty: !readStoredXPostText(input.step.configuration),
    memoryUsed,
    classifyMode: classification.mode,
    classifyReason: classification.reason,
    needsInputReason: shouldRequestXPostUserInput(classification)
      ? classification.reason
      : null,
    generatedXPostTextPresent: Boolean(preparedText),
  });

  const source = readXPostContentSource(input.step.configuration);
  if (classification.mode === "fixed") {
    text = classification.text;
  } else if (
    classification.mode === "generate" ||
    source === "generate" ||
    preparedText
  ) {
    text = preparedText;
    if (!text) {
      const generated = await generateXAutomationPostText({
        classification,
        automationName: input.automationName,
        memoryInjection:
          typeof input.resolvedInstruction?.merged.memoryInjectionText ===
          "string"
            ? input.resolvedInstruction.merged.memoryInjectionText
            : null,
        userId: input.userId,
        runId: input.runId,
        skipAutoHashtags: Boolean(
          configString(input.step.configuration, ["hashtags"]),
        ),
      });
      logXPostInstructionTrace({
        stage: "generate",
        automationId: input.automationId,
        runId: input.runId,
        executionId: input.runId,
        contentSource: "generate",
        originalUserRequestPresent: originalPresent,
        generateInstructionPresent: Boolean(
          input.step.configuration.generateInstruction,
        ),
        resolvedGenerateInstructionPresent: Boolean(
          classification.generateInstruction,
        ),
        configurationTextEmpty: !readStoredXPostText(input.step.configuration),
        memoryUsed,
        classifyMode: classification.mode,
        classifyReason: classification.reason,
        generatedXPostTextPresent: Boolean(generated.ok),
      });
      if (!generated.ok) {
        return generationFailedResult();
      }
      text = generated.text;
    }
  } else {
    logXPostInstructionTrace({
      stage: "needs_input",
      automationId: input.automationId,
      runId: input.runId,
      executionId: input.runId,
      contentSource: "unresolved",
      originalUserRequestPresent: originalPresent,
      generateInstructionPresent: Boolean(
        input.step.configuration.generateInstruction,
      ),
      resolvedGenerateInstructionPresent: Boolean(
        classification.generateInstruction,
      ),
      configurationTextEmpty: !readStoredXPostText(input.step.configuration),
      memoryUsed,
      classifyMode: classification.mode,
      classifyReason: classification.reason,
      needsInputReason: classification.reason,
      generatedXPostTextPresent: false,
    });
    return configMissingInput(X_POST_MISSING_CONTENT_MESSAGE);
  }

  if (
    classification.mode === "fixed" &&
    allowsFixedTextHashtagAuto({
      configuration: input.step.configuration,
      notes: input.freeformNotes,
    })
  ) {
    const memoryInjection =
      typeof input.resolvedInstruction?.merged.memoryInjectionText === "string"
        ? input.resolvedInstruction.merged.memoryInjectionText
        : null;
    text = applyXAutomationPostHashtags({
      text,
      topic: classification.topic,
      memoryInjection,
    }).text;
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
      summary:
        classification.mode === "generate"
          ? "Xに投稿しました（AI生成）"
          : "Xに投稿しました（指定本文）",
      provider: "x",
      operation: "post",
      resourceId: tweetId,
      url: result.history?.tweetUrl ?? null,
      label:
        classification.mode === "generate"
          ? `X post (AI generate, run ${input.runId})`
          : `X post (fixed, run ${input.runId})`,
    });
  } catch (error) {
    return mapThrownProviderError("X", error);
  }
};
