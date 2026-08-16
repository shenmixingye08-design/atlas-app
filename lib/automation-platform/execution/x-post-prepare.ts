import "server-only";

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
      xPostContentMode: "generate",
      generateInstruction: classification.generateInstruction || null,
      generatedXPostText: generated.text,
      generatedAt: new Date().toISOString(),
      summary: `${input.preparation.summary}\n\n${appendix}`,
    },
    resolvedInstruction: resolved,
  };
}
