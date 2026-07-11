import "server-only";

import { createAtlasResponse } from "@/lib/openai";
import { isMockLlmEnabled } from "@/lib/ai/mock-responses";
import { wrapCompactInstructions } from "@/lib/atlas-personality";

import { DRIVE_CATEGORY_FOLDERS } from "./constants";
import type {
  DriveAiClassification,
  DriveAiSearchHit,
  DriveAiSummary,
  DriveCategoryId,
  DriveFileItem,
} from "./types";

const DRIVE_AI_INSTRUCTIONS = wrapCompactInstructions(
  "Google Drive document assistant for ATLAS. Respond in Japanese with calm secretary tone (keigo). Return valid JSON only, no markdown fences.",
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

const CATEGORY_IDS = Object.keys(DRIVE_CATEGORY_FOLDERS) as DriveCategoryId[];

function isDriveCategoryId(value: string): value is DriveCategoryId {
  return CATEGORY_IDS.includes(value as DriveCategoryId);
}

export async function summarizeDriveDocument(input: {
  file: DriveFileItem;
  text: string;
}): Promise<DriveAiSummary> {
  if (isMockLlmEnabled()) {
    return {
      fileId: input.file.id,
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
    instructions: DRIVE_AI_INSTRUCTIONS,
    input: `Summarize this Drive document for a busy executive. Return JSON:
{ "summaryLines": ["...", "...", "..."], "preview": "short Japanese preview under 200 chars" }

File name: ${input.file.name}
Kind: ${input.file.kind}
MIME: ${input.file.mimeType}
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
    fileId: input.file.id,
    fileName: input.file.name,
    kind: input.file.kind,
    summaryLines: (parsed.summaryLines ?? []).slice(0, 3),
    preview: parsed.preview?.trim() || input.text.slice(0, 200),
  };
}

export async function searchDriveDocumentsWithAi(input: {
  query: string;
  files: readonly { file: DriveFileItem; text: string }[];
}): Promise<DriveAiSearchHit[]> {
  if (input.files.length === 0) return [];

  if (isMockLlmEnabled()) {
    const needle = input.query.toLowerCase();
    return input.files
      .map(({ file, text }, index) => {
        const hay = `${file.name}\n${text}`.toLowerCase();
        const matched = hay.includes(needle) || index === 0;
        return matched
          ? {
              fileId: file.id,
              fileName: file.name,
              kind: file.kind,
              reason: `「${input.query}」に関連する内容を含みます`,
              score: matched && hay.includes(needle) ? 0.9 : 0.5,
            }
          : null;
      })
      .filter((hit): hit is DriveAiSearchHit => hit !== null)
      .slice(0, 8);
  }

  const payload = input.files.map(({ file, text }) => ({
    fileId: file.id,
    fileName: file.name,
    kind: file.kind,
    preview: text.slice(0, 1200),
  }));

  const response = await createAtlasResponse({
    aiTaskType: "chat",
    instructions: DRIVE_AI_INSTRUCTIONS,
    input: `Find documents relevant to the user query. Return JSON:
{ "hits": [ { "fileId": "...", "reason": "Japanese reason", "score": 0.0-1.0 } ] }
Only include relevant files. Max 8 hits.

Query: ${input.query}
Documents:
${JSON.stringify(payload)}`,
    maxOutputTokens: 900,
    temperature: 0.2,
  });

  const parsed = extractJsonObject(getResponseText(response)) as {
    hits?: { fileId?: string; reason?: string; score?: number }[];
  };

  const byId = new Map(input.files.map((item) => [item.file.id, item.file]));

  return (parsed.hits ?? [])
    .map((hit) => {
      const file = hit.fileId ? byId.get(hit.fileId) : undefined;
      if (!file) return null;
      return {
        fileId: file.id,
        fileName: file.name,
        kind: file.kind,
        reason: hit.reason?.trim() || "関連する可能性があります",
        score: typeof hit.score === "number" ? hit.score : 0.5,
      } satisfies DriveAiSearchHit;
    })
    .filter((hit): hit is DriveAiSearchHit => hit !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export async function classifyDriveDocument(input: {
  file: DriveFileItem;
  text: string;
}): Promise<DriveAiClassification> {
  if (isMockLlmEnabled()) {
    const name = input.file.name.toLowerCase();
    let suggested: DriveCategoryId = "other";
    if (/blog|ブログ/.test(name)) suggested = "blog";
    else if (/sns|x\.com|twitter|instagram/.test(name)) suggested = "sns";
    else if (/mail|メール|email/.test(name)) suggested = "email";
    else if (/提案|営業|proposal|sales/.test(name)) suggested = "sales_material";

    return {
      fileId: input.file.id,
      fileName: input.file.name,
      suggestedCategory: suggested,
      label: DRIVE_CATEGORY_FOLDERS[suggested],
      reason: `ファイル名と内容から「${DRIVE_CATEGORY_FOLDERS[suggested]}」に分類しました`,
    };
  }

  const response = await createAtlasResponse({
    aiTaskType: "chat",
    instructions: DRIVE_AI_INSTRUCTIONS,
    input: `Classify this Drive document into one ATLAS category.
Categories: ${JSON.stringify(DRIVE_CATEGORY_FOLDERS)}
Return JSON: { "suggestedCategory": "sales_material|blog|sns|email|other", "reason": "Japanese reason" }

File name: ${input.file.name}
Kind: ${input.file.kind}
Content:
${input.text.slice(0, 4000)}`,
    maxOutputTokens: 400,
    temperature: 0.1,
  });

  const parsed = extractJsonObject(getResponseText(response)) as {
    suggestedCategory?: string;
    reason?: string;
  };

  const suggested = isDriveCategoryId(parsed.suggestedCategory ?? "")
    ? (parsed.suggestedCategory as DriveCategoryId)
    : "other";

  return {
    fileId: input.file.id,
    fileName: input.file.name,
    suggestedCategory: suggested,
    label: DRIVE_CATEGORY_FOLDERS[suggested],
    reason: parsed.reason?.trim() || "内容に基づき分類しました",
  };
}
