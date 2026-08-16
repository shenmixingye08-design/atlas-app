/**
 * Generate X post copy for generate-type automations.
 * AI is used only for the tweet body. Failures are retryable — never
 * rewritten as "please type the post yourself".
 */

import "server-only";

import { isMockLlmEnabled } from "@/lib/ai/mock-responses";
import { wrapCompactInstructions } from "@/lib/atlas-personality";
import { createAtlasResponse } from "@/lib/openai";
import { capToTweetLength } from "@/lib/integrations/x/post/autopost-generator";
import {
  X_POST_GENERATION_FAILED_CODE,
  X_POST_GENERATION_FAILED_MESSAGE,
  type XPostContentClassification,
} from "@/lib/automation-platform/execution/x-post-content";

export type GeneratedXAutomationPost =
  | { ok: true; text: string; usedFallback: boolean }
  | { ok: false; errorCode: string; errorMessage: string };

const GENERATION_INSTRUCTIONS = wrapCompactInstructions(
  `あなたはお客様専属のAI秘書として、X（旧Twitter）に投稿する日本語の文章を1件だけ作成します。
出力ルール:
- 本文のみを出力する（前置き・説明・鉤括弧・コードブロックは書かない）。
- 全体で280文字以内（日本語1文字も1文字として数える）。
- 自然で読みやすい日本語。過度な絵文字や誇張、事実でない実績は書かない。
- 直近の投稿と内容・言い回しが重複しないようにする。
- ハッシュタグは指示があるときのみ1〜2個、末尾に付ける。`,
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

function buildGenerationInput(input: {
  classification: XPostContentClassification;
  automationName: string;
  memoryInjection?: string | null;
  recentTexts?: string[];
}): string {
  const recent =
    input.recentTexts && input.recentTexts.length > 0
      ? input.recentTexts
          .slice(0, 8)
          .map((text, index) => `${index + 1}. ${text.replace(/\s+/g, " ")}`)
          .join("\n")
      : "（まだありません）";
  return [
    `自動化名: ${input.automationName || "（なし）"}`,
    `テーマ: ${input.classification.topic || "（指定なし）"}`,
    `お客様の依頼:`,
    input.classification.generateInstruction || "（なし）",
    input.memoryInjection?.trim()
      ? `\n文体・好み（参照のみ）:\n${input.memoryInjection.trim()}`
      : "",
    "",
    "直近の投稿（これらと重複しないこと）:",
    recent,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export async function generateXAutomationPostText(input: {
  classification: XPostContentClassification;
  automationName: string;
  memoryInjection?: string | null;
  recentTexts?: string[];
}): Promise<GeneratedXAutomationPost> {
  const prompt = buildGenerationInput(input);

  if (isMockLlmEnabled()) {
    const topic = input.classification.topic || input.automationName || "本日の話題";
    return {
      ok: true,
      text: capToTweetLength(
        `${topic}について、今回の依頼に沿ってご案内します。`,
      ),
      usedFallback: true,
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
    return { ok: true, text, usedFallback: false };
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
