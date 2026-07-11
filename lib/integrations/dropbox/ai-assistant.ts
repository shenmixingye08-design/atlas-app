import "server-only";

import { createAtlasResponse } from "@/lib/openai";
import { isMockLlmEnabled } from "@/lib/ai/mock-responses";
import { wrapCompactInstructions } from "@/lib/atlas-personality";

import type { DropboxAiSummary, DropboxFileItem, DropboxPdfAnalysis } from "./types";

const DROPBOX_AI_INSTRUCTIONS = wrapCompactInstructions(
  "Dropbox document assistant for ATLAS. Respond in Japanese with calm secretary tone (keigo). Return valid JSON only, no markdown fences.",
);

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("Failed to parse AI JSON response");
    return JSON.parse(match[0]);
  }
}

function getResponseText(response: { output_text?: string | null }): string {
  return response.output_text?.trim() ?? "";
}

export async function summarizeDropboxDocument(input: {
  file: DropboxFileItem;
  text: string;
}): Promise<DropboxAiSummary> {
  if (isMockLlmEnabled()) {
    return {
      path: input.file.pathDisplay,
      fileName: input.file.name,
      kind: input.file.kind,
      summaryLines: [
        `「${input.file.name}」の内容を確認しました。`,
        `種類: ${input.file.kind}`,
        input.text.slice(0, 80) || "本文プレビューはありません。",
      ],
      preview: input.text.slice(0, 240),
    };
  }

  const response = await createAtlasResponse({
    aiTaskType: "chat",
    instructions: DROPBOX_AI_INSTRUCTIONS,
    input: `Summarize this Dropbox document. Return JSON:
{ "summaryLines": ["...", "...", "..."], "preview": "short Japanese preview under 200 chars" }

File name: ${input.file.name}
Kind: ${input.file.kind}
Content:
${input.text.slice(0, 6000)}`,
    maxOutputTokens: 600,
    temperature: 0.2,
  });

  const parsed = extractJsonObject(getResponseText(response)) as {
    summaryLines?: string[];
    preview?: string;
  };

  return {
    path: input.file.pathDisplay,
    fileName: input.file.name,
    kind: input.file.kind,
    summaryLines: (parsed.summaryLines ?? []).slice(0, 3),
    preview: parsed.preview?.trim() || input.text.slice(0, 200),
  };
}

export async function analyzeDropboxPdfText(input: {
  file: DropboxFileItem;
  text: string;
}): Promise<DropboxPdfAnalysis> {
  if (isMockLlmEnabled()) {
    return {
      path: input.file.pathDisplay,
      fileName: input.file.name,
      extractedChars: input.text.length,
      summaryLines: [
        `PDF「${input.file.name}」を解析しました。`,
        `抽出文字数: ${input.text.length}`,
        input.text.slice(0, 80) || "抽出テキストが少ないため、再解析を推奨します。",
      ],
      preview: input.text.slice(0, 240),
    };
  }

  const response = await createAtlasResponse({
    aiTaskType: "chat",
    instructions: DROPBOX_AI_INSTRUCTIONS,
    input: `Analyze this PDF text extracted from Dropbox. Return JSON:
{ "summaryLines": ["...", "...", "..."], "preview": "short Japanese preview under 200 chars" }

File name: ${input.file.name}
Extracted text:
${input.text.slice(0, 8000)}`,
    maxOutputTokens: 700,
    temperature: 0.2,
  });

  const parsed = extractJsonObject(getResponseText(response)) as {
    summaryLines?: string[];
    preview?: string;
  };

  return {
    path: input.file.pathDisplay,
    fileName: input.file.name,
    extractedChars: input.text.length,
    summaryLines: (parsed.summaryLines ?? []).slice(0, 3),
    preview: parsed.preview?.trim() || input.text.slice(0, 200),
  };
}
