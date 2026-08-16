import "server-only";

import {
  classifyXPostContent,
  readOriginalUserRequest,
} from "@/lib/automation-platform/execution/x-post-content";
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

  const structuredOptions = {
    ...(input.automation.instruction.structuredOptions ?? {}),
    ...(input.resolvedInstruction?.structuredOptions ?? {}),
    ...(typeof input.resolvedInstruction?.merged.originalUserRequest ===
    "string"
      ? {
          originalUserRequest:
            input.resolvedInstruction.merged.originalUserRequest,
        }
      : {}),
  };
  const classification = classifyXPostContent({
    configuration: xStep.configuration,
    structuredOptions,
    freeformNotes: input.automation.instruction.freeformNotes,
    description:
      input.automation.description ||
      (typeof input.resolvedInstruction?.merged.description === "string"
        ? input.resolvedInstruction.merged.description
        : null),
    automationName: input.automation.name,
    resolvedNotes: input.resolvedInstruction?.freeformNotes,
    resumeNotes: input.preparation.resumeNotes,
  });
  const originalInstruction = readOriginalUserRequest({
    configuration: xStep.configuration,
    structuredOptions,
    freeformNotes: input.automation.instruction.freeformNotes,
    description: input.automation.description,
  });
  const memoryUsed = Boolean(
    input.resolvedInstruction?.merged.memoryInjectionText ||
      (Array.isArray(input.resolvedInstruction?.merged.memoryIdsUsed) &&
        input.resolvedInstruction.merged.memoryIdsUsed.length > 0),
  );
  const proof: Pick<
    RunPreparation,
    | "originalInstruction"
    | "resolvedGenerateInstruction"
    | "contentSource"
    | "memoryUsed"
    | "xPostClassifyReason"
    | "needsInputReason"
  > = {
    originalInstruction: originalInstruction || null,
    resolvedGenerateInstruction: classification.generateInstruction || null,
    contentSource:
      classification.mode === "generate"
        ? "generate"
        : classification.mode === "fixed"
          ? "fixed"
          : "unresolved",
    memoryUsed,
    xPostClassifyReason: classification.reason,
    needsInputReason:
      classification.mode === "missing" ? classification.reason : null,
  };

  if (classification.mode !== "generate") {
    return {
      preparation: {
        ...input.preparation,
        ...proof,
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

  const generated = await generateXAutomationPostText({
    classification,
    automationName: input.automation.name,
    memoryInjection:
      typeof input.resolvedInstruction?.merged.memoryInjectionText === "string"
        ? input.resolvedInstruction.merged.memoryInjectionText
        : null,
  });

  if (!generated.ok) {
    return {
      preparation: {
        ...input.preparation,
        ...proof,
        xPostContentMode: "generate",
        generateInstruction: classification.generateInstruction || null,
        generatedXPostText: null,
      },
      resolvedInstruction: input.resolvedInstruction,
    };
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
      ...proof,
      xPostContentMode: "generate",
      generateInstruction: classification.generateInstruction || null,
      generatedXPostText: generated.text,
      generatedAt: new Date().toISOString(),
      summary: `${input.preparation.summary}\n\n${appendix}`,
    },
    resolvedInstruction: resolved,
  };
}
