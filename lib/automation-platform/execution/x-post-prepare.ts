import "server-only";

import { estimateTokens } from "@/lib/ai/cost-meter";
import { evaluateBillingAiUsage } from "@/lib/billing/access/snapshot";
import { getPlanDefinition } from "@/lib/billing/plans/registry";
import {
  ensureBillingUsageHydratedForUser,
  persistBillingUsageForUserNow,
} from "@/lib/billing/usage/durable";
import {
  peekAiRunReservation,
  popAiRunReservation,
} from "@/lib/billing/usage/reservation";
import {
  appendAiUsageEvent,
  releaseAiRunQuota,
  tryConsumeAiRunQuota,
} from "@/lib/billing/usage/store";
import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { classifyXPostContent } from "@/lib/automation-platform/execution/x-post-content";
import {
  buildGeneratedXPostApprovalSummary,
  generateXAutomationPostText,
} from "@/lib/automation-platform/execution/x-post-generate";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type { ResolvedInstruction } from "@/lib/automation-platform/types/instruction";
import type { RunPreparation } from "@/lib/automation-platform/types/run";

/**
 * Generate run-scoped X copy before approval so the user reviews text,
 * not writes it. Does not persist onto the automation definition.
 */
export async function maybePrepareXPostCopyForRun(input: {
  automation: AutomationV2;
  preparation: RunPreparation;
  resolvedInstruction: ResolvedInstruction | null;
  usageClaimKey?: string | null;
}): Promise<{
  preparation: RunPreparation;
  resolvedInstruction: ResolvedInstruction | null;
}> {
  const xStep = input.automation.workflow.steps.find(
    (step) => step.enabled && step.type === "x_post",
  );
  if (!xStep) {
    return {
      preparation: input.preparation,
      resolvedInstruction: input.resolvedInstruction,
    };
  }

  const classification = classifyXPostContent({
    configuration: xStep.configuration,
    freeformNotes: input.automation.instruction.freeformNotes,
    automationName: input.automation.name,
    resolvedNotes: input.resolvedInstruction?.freeformNotes,
    resumeNotes: input.preparation.resumeNotes,
  });

  if (classification.mode !== "generate") {
    return {
      preparation: {
        ...input.preparation,
        xPostContentMode: classification.mode,
        generateInstruction: classification.generateInstruction || null,
        generatedXPostText:
          classification.mode === "fixed" ? classification.text : input.preparation.generatedXPostText,
        generatedAt:
          classification.mode === "fixed"
            ? input.preparation.generatedAt ?? null
            : input.preparation.generatedAt,
      },
      resolvedInstruction: input.resolvedInstruction,
    };
  }

  await ensureBillingUsageHydratedForUser(input.automation.userId);
  const access = await evaluateBillingAiUsage(input.automation.userId);
  const prepaid = peekAiRunReservation(input.automation.userId);
  const claimKey =
    prepaid?.claimKey ||
    input.usageClaimKey?.trim() ||
    `ai:${input.automation.id}:${input.preparation.preparedAt}`;
  const reserved = prepaid
    ? { allowed: true, incremented: prepaid.incremented }
    : tryConsumeAiRunQuota({
        userId: input.automation.userId,
        claimKey,
        limit: getPlanDefinition(access.snapshot.effectivePlanId).limits
          .aiUsageMonthly,
        bypassLimit: access.snapshot.isOwner,
      });
  if (!reserved.allowed) {
    throw new AutomationPlatformError("automation_usage_limit", {
      reason: access.denial?.reason ?? "ai_usage_limit",
    });
  }

  const generated = await generateXAutomationPostText({
    classification,
    automationName: input.automation.name,
    memoryInjection:
      typeof input.resolvedInstruction?.merged.memoryInjectionText === "string"
        ? input.resolvedInstruction.merged.memoryInjectionText
        : null,
  });

  if (!generated.ok) {
    if (prepaid) {
      popAiRunReservation(input.automation.userId);
    }
    if (reserved.incremented) {
      releaseAiRunQuota({
        userId: input.automation.userId,
        claimKey,
      });
    }
    return {
      preparation: {
        ...input.preparation,
        xPostContentMode: "generate",
        generateInstruction: classification.generateInstruction || null,
        generatedXPostText: null,
      },
      resolvedInstruction: input.resolvedInstruction,
    };
  }

  if (prepaid) {
    popAiRunReservation(input.automation.userId);
  }
  if (reserved.incremented || prepaid) {
    const inputTokens = estimateTokens(classification.generateInstruction);
    const outputTokens = estimateTokens(generated.text);
    appendAiUsageEvent({
      id: `aiu_${crypto.randomUUID()}`,
      userId: input.automation.userId,
      planId: access.snapshot.effectivePlanId,
      timestamp: new Date().toISOString(),
      model: "automation-x-post",
      api: "automation",
      feature: "x_post_generate",
      requestCount: 1,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      estimatedCostUsd: 0,
    });
    await persistBillingUsageForUserNow(input.automation.userId);
  }

  const appendix = buildGeneratedXPostApprovalSummary(generated.text);
  const resolved = input.resolvedInstruction
    ? {
        ...input.resolvedInstruction,
        merged: {
          ...input.resolvedInstruction.merged,
          generatedXPostText: generated.text,
          generateInstruction: classification.generateInstruction,
          xPostContentMode: "generate",
        },
      }
    : input.resolvedInstruction;

  return {
    preparation: {
      ...input.preparation,
      xPostContentMode: "generate",
      generateInstruction: classification.generateInstruction || null,
      generatedXPostText: generated.text,
      generatedAt: new Date().toISOString(),
      summary: `${input.preparation.summary}\n\n${appendix}`,
    },
    resolvedInstruction: resolved,
  };
}
