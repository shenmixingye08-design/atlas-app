import "server-only";

import { createAtlasResponse } from "@/lib/openai";
import { isMockLlmEnabled } from "@/lib/ai/mock-responses";

import type {
  GmailMessage,
  GmailMessageAnalysis,
  GmailReplyDraftContent,
} from "./types";

import { wrapCompactInstructions } from "@/lib/atlas-personality";

const GMAIL_AI_INSTRUCTIONS = wrapCompactInstructions(
  "Gmail workspace assistant for ATLAS. Respond in Japanese with calm secretary tone (keigo). Return valid JSON only, no markdown fences.",
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

function buildMockAnalysis(messages: readonly GmailMessage[]): GmailMessageAnalysis[] {
  return messages.map((message, index) => ({
    messageId: message.id,
    isImportant: message.isUnread || index < 2,
    importanceReason:
      message.isUnread && index < 2
        ? "未読かつ返信が必要な可能性があります"
        : "参考情報として確認を推奨",
    summaryLines: [
      `${message.sender}からの連絡です。`,
      `件名: ${message.subject}`,
      message.bodyText.slice(0, 60) || "本文の要約対象テキストがありません。",
    ],
  }));
}

function buildMockReplyDraft(message: GmailMessage): GmailReplyDraftContent {
  return {
    messageId: message.id,
    subject: message.subject.startsWith("Re:")
      ? message.subject
      : `Re: ${message.subject}`,
    to: message.sender,
    body: `${message.sender} 様\n\nご連絡ありがとうございます。\n内容を確認しました。追って詳細をご返信いたします。\n\nよろしくお願いいたします。`,
  };
}

export async function analyzeGmailMessages(
  messages: readonly GmailMessage[],
): Promise<GmailMessageAnalysis[]> {
  if (messages.length === 0) return [];

  if (isMockLlmEnabled()) {
    return buildMockAnalysis(messages);
  }

  const payload = messages.map((message) => ({
    id: message.id,
    subject: message.subject,
    sender: message.sender,
    receivedAt: message.receivedAt,
    isUnread: message.isUnread,
    labels: message.labels,
    bodyPreview: message.bodyText.slice(0, 1200),
  }));

  const response = await createAtlasResponse({
    aiTaskType: "chat",
    instructions: GMAIL_AI_INSTRUCTIONS,
    input: `Analyze these emails. For each message return isImportant (boolean), importanceReason (string), summaryLines (array of exactly 3 Japanese lines).
Return JSON: { "messages": [ { "messageId": "...", "isImportant": true, "importanceReason": "...", "summaryLines": ["...", "...", "..."] } ] }

Emails:
${JSON.stringify(payload)}`,
    maxOutputTokens: 1200,
    temperature: 0.2,
  });

  const parsed = extractJsonObject(getResponseText(response)) as {
    messages?: GmailMessageAnalysis[];
  };

  const analyses = parsed.messages ?? [];
  const byId = new Map(analyses.map((item) => [item.messageId, item]));

  return messages.map((message) => {
    const found = byId.get(message.id);
    if (!found) {
      return {
        messageId: message.id,
        isImportant: false,
        importanceReason: "分析結果を取得できませんでした",
        summaryLines: [
          `${message.sender}からのメール`,
          message.subject,
          "要約を再生成してください",
        ],
      };
    }

    return {
      messageId: message.id,
      isImportant: Boolean(found.isImportant),
      importanceReason: found.importanceReason?.trim() || "重要度を判定しました",
      summaryLines: (found.summaryLines ?? []).slice(0, 3),
    };
  });
}

export async function createGmailReplyDraft(
  message: GmailMessage,
): Promise<GmailReplyDraftContent> {
  if (isMockLlmEnabled()) {
    return buildMockReplyDraft(message);
  }

  const response = await createAtlasResponse({
    aiTaskType: "chat",
    instructions: GMAIL_AI_INSTRUCTIONS,
    input: `Create a polite Japanese reply draft. Do not send email. Return JSON:
{ "messageId": "...", "subject": "Re: ...", "to": "...", "body": "..." }

Original email:
Subject: ${message.subject}
From: ${message.sender}
Body:
${message.bodyText.slice(0, 4000)}`,
    maxOutputTokens: 900,
    temperature: 0.4,
  });

  const parsed = extractJsonObject(getResponseText(response)) as GmailReplyDraftContent;

  return {
    messageId: message.id,
    subject:
      parsed.subject?.trim() ||
      (message.subject.startsWith("Re:")
        ? message.subject
        : `Re: ${message.subject}`),
    to: parsed.to?.trim() || message.sender,
    body: parsed.body?.trim() || "返信下書きを生成できませんでした。",
  };
}

export function extractImportantMessages(
  analyses: readonly GmailMessageAnalysis[],
): GmailMessageAnalysis[] {
  return analyses.filter((item) => item.isImportant);
}
