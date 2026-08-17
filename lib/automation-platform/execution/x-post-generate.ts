/**
 * Generate X post copy for generate-type automations.
 * AI is used only for the tweet body. Failures are retryable — never
 * rewritten as "please type the post yourself".
 *
 * Quality-only module: does not change cron, OAuth, posting, or approval.
 */

import "server-only";

import { isMockLlmEnabled } from "@/lib/ai/mock-responses";
import { wrapCompactInstructions } from "@/lib/atlas-personality";
import { createAtlasResponse } from "@/lib/openai";
import { capToTweetLength } from "@/lib/integrations/x/post/autopost-generator";
import { listXPostHistory } from "@/lib/integrations/x/post/history-store";
import {
  X_POST_GENERATION_FAILED_CODE,
  X_POST_GENERATION_FAILED_MESSAGE,
  type XPostContentClassification,
} from "@/lib/automation-platform/execution/x-post-content";
import {
  buildXAutomationPostFallbackText,
  buildXAutomationPostGenerationInput,
  buildXAutomationPostGenerationInstructions,
  deriveXAutomationPostAngleSeed,
  selectXAutomationPostAngle,
  type XAutomationPostAngle,
} from "@/lib/automation-platform/execution/x-post-copy-quality";

export type GeneratedXAutomationPost =
  | {
      ok: true;
      text: string;
      usedFallback: boolean;
      angle?: XAutomationPostAngle;
    }
  | { ok: false; errorCode: string; errorMessage: string };

export const GENERATION_INSTRUCTIONS = wrapCompactInstructions(
  buildXAutomationPostGenerationInstructions(),
);

function sanitizeGeneratedText(raw: string): string {
  let text = raw.trim();
  const fence = /^```(?:\w+)?\s*([\s\S]*?)```$/.exec(text);
  if (fence) text = fence[1]!.trim();
  text = text.replace(/^["'「『]+/, "").replace(/["'」』]+$/, "");
  return text.trim();
}

function extractTweetFromModelOutput(raw: string): string {
  const sanitized = sanitizeGeneratedText(raw);
  if (!sanitized) return "";
  if (sanitized.startsWith("{") || sanitized.startsWith("[")) {
    try {
      const parsed = JSON.parse(sanitized) as {
        snsPost?: unknown;
        posts?: unknown;
        content?: unknown;
        plainText?: unknown;
      };
      if (typeof parsed.snsPost === "string" && parsed.snsPost.trim()) {
        return parsed.snsPost.trim();
      }
      if (Array.isArray(parsed.posts)) {
        const first = parsed.posts.find(
          (item) => typeof item === "string" && item.trim(),
        );
        if (typeof first === "string") return first.trim();
      }
      if (typeof parsed.plainText === "string" && parsed.plainText.trim()) {
        const firstLine = parsed.plainText
          .split(/\n{2,}/)[0]
          ?.replace(/^投稿\s*\d+:\s*/u, "")
          .trim();
        if (firstLine) return firstLine;
      }
      if (typeof parsed.content === "string" && parsed.content.trim()) {
        return parsed.content.trim();
      }
    } catch {
      return "";
    }
    return "";
  }
  return sanitized;
}

function resolveRecentTexts(input: {
  recentTexts?: string[];
  userId?: string | null;
}): string[] {
  if (input.recentTexts && input.recentTexts.length > 0) {
    return input.recentTexts.slice(0, 8);
  }
  const userId = input.userId?.trim();
  if (!userId) return [];
  try {
    return listXPostHistory(userId)
      .filter((record) => record.status === "success" && record.text.trim())
      .map((record) => record.text.trim())
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function buildGenerationInput(input: {
  classification: XPostContentClassification;
  automationName: string;
  memoryInjection?: string | null;
  recentTexts?: string[];
  angle: XAutomationPostAngle;
}): string {
  return buildXAutomationPostGenerationInput({
    automationName: input.automationName,
    topic: input.classification.topic,
    generateInstruction: input.classification.generateInstruction,
    angle: input.angle,
    memoryInjection: input.memoryInjection,
    recentTexts: input.recentTexts,
  });
}

export async function generateXAutomationPostText(input: {
  classification: XPostContentClassification;
  automationName: string;
  memoryInjection?: string | null;
  recentTexts?: string[];
  userId?: string | null;
  runId?: string | null;
  angleSeed?: number;
}): Promise<GeneratedXAutomationPost> {
  const recentTexts = resolveRecentTexts(input);
  const angle = selectXAutomationPostAngle(
    deriveXAutomationPostAngleSeed({
      angleSeed: input.angleSeed,
      runId: input.runId,
      recentTexts,
      topic: input.classification.topic,
    }),
  );
  const prompt = buildGenerationInput({
    classification: input.classification,
    automationName: input.automationName,
    memoryInjection: input.memoryInjection,
    recentTexts,
    angle,
  });

  if (isMockLlmEnabled()) {
    return {
      ok: true,
      text: capToTweetLength(
        buildXAutomationPostFallbackText({
          angle,
          topic: input.classification.topic || input.automationName,
        }),
      ),
      usedFallback: true,
      angle,
    };
  }

  try {
    const response = await createAtlasResponse({
      input: prompt,
      instructions: GENERATION_INSTRUCTIONS,
      aiTaskType: "worker_deliverable_light",
      maxOutputTokens: 400,
    });
    const text = capToTweetLength(
      extractTweetFromModelOutput(response.output_text ?? ""),
    );
    if (!text) {
      return {
        ok: false,
        errorCode: X_POST_GENERATION_FAILED_CODE,
        errorMessage: X_POST_GENERATION_FAILED_MESSAGE,
      };
    }
    return { ok: true, text, usedFallback: false, angle };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "x_post_generation_failed";
    console.warn("[X automation] copy generation failed:", detail);
    return {
      ok: false,
      errorCode: X_POST_GENERATION_FAILED_CODE,
      errorMessage: X_POST_GENERATION_FAILED_MESSAGE,
    };
  }
}

export function readPreparedXPostText(input: {
  generatedXPostText?: string | null;
  resolvedMerged?: Readonly<Record<string, unknown>> | null;
}): string {
  if (input.generatedXPostText?.trim()) return input.generatedXPostText.trim();
  const merged = input.resolvedMerged?.generatedXPostText;
  if (typeof merged === "string" && merged.trim()) return merged.trim();
  return "";
}

export function buildGeneratedXPostApprovalSummary(text: string): string {
  return [
    "投稿本文（今回MINERVOTが作成しました。入力は不要です）:",
    text,
    "",
    "内容をご確認のうえ、承認してください。",
  ].join("\n");
}
