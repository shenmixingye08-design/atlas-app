import type { MemoryResolveContext, SaveCandidate } from "./types";
import { containsForbiddenSecret, containsPromptInjection } from "./security";

const EXPLICIT_ALWAYS =
  /(?:今後は|次から|毎回|いつも|基本的に|覚えて|記憶して|忘れないで)/i;
const JOB_SCOPE = /(?:この仕事では|この自動化では|この依頼では)/i;
const PROJECT_SCOPE = /(?:このプロジェクトでは|この案件では)/i;
const TEMPORARY =
  /(?:今日だけ|今回だけ|とりあえず|一時的に|今だけ)/i;

const PREFERENCE_LINE =
  /(?:今後は|次から|毎回|いつも|基本的に|この仕事では|このプロジェクトでは|今日だけ|今回だけ|今だけ)\s*([^\n。]{3,120})/gi;

/**
 * Extract save candidates from an explicit user assignment.
 * Never treats external-document injection phrases as user intent.
 */
export function extractSaveCandidatesFromAssignment(
  context: MemoryResolveContext,
): SaveCandidate[] {
  const text = context.assignment.trim();
  if (!text || containsPromptInjection(text) || containsForbiddenSecret(text)) {
    return [];
  }

  const candidates: SaveCandidate[] = [];
  const isTemporary = TEMPORARY.test(text);
  let scope: SaveCandidate["scope"] = "user";
  if (JOB_SCOPE.test(text)) scope = "job";
  else if (PROJECT_SCOPE.test(text)) scope = "project";
  if (isTemporary) scope = "conversation";

  const hasSaveSignal =
    EXPLICIT_ALWAYS.test(text) ||
    JOB_SCOPE.test(text) ||
    PROJECT_SCOPE.test(text) ||
    isTemporary;
  if (!hasSaveSignal) {
    return [];
  }

  for (const match of text.matchAll(PREFERENCE_LINE)) {
    const value = (match[1] ?? "").trim();
    if (value.length < 3) continue;
    if (containsForbiddenSecret(value) || containsPromptInjection(value)) continue;

    candidates.push(
      buildCandidate(context, {
        scope,
        value,
        isTemporary,
        confidence: 0.9,
      }),
    );
  }

  // Fallback: whole preference sentence after trigger
  if (candidates.length === 0) {
    const clipped = text.replace(/\s+/g, " ").slice(0, 200);
    candidates.push(
      buildCandidate(context, {
        scope,
        value: clipped,
        isTemporary,
        confidence: isTemporary ? 0.85 : 0.75,
        key: isTemporary ? inferKey(clipped) : "general_preference",
      }),
    );
  }

  return dedupeCandidates(candidates);
}

function buildCandidate(
  context: MemoryResolveContext,
  input: {
    scope: SaveCandidate["scope"];
    value: string;
    isTemporary: boolean;
    confidence: number;
    key?: string;
  },
): SaveCandidate {
  return {
    scope: input.scope,
    category: inferCategory(input.value),
    key: input.key ?? inferKey(input.value),
    value: input.value,
    source: "explicit_user_instruction",
    confidence: input.confidence,
    isTemporary: input.isTemporary,
    expiresAt: input.isTemporary
      ? new Date(
          (context.now ?? new Date()).getTime() + 24 * 60 * 60 * 1000,
        ).toISOString()
      : null,
    projectId: context.projectId ?? null,
    jobId: context.jobId ?? null,
    automationId: context.automationId ?? null,
  };
}

function inferCategory(value: string): string {
  if (/絵文字|emoji|ハッシュタグ|投稿|sns|x\b/i.test(value)) return "sns";
  if (/敬語|文体|口調|トーン/i.test(value)) return "writing";
  if (/excel|xlsx|powerpoint|pptx|pdf|word|docx|形式/i.test(value)) {
    return "format";
  }
  if (/メール|件名|署名/i.test(value)) return "email";
  return "preference";
}

function inferKey(value: string): string {
  if (/絵文字/i.test(value)) return "emoji_style";
  if (/ハッシュタグ/i.test(value)) return "hashtag_policy";
  if (/敬語|文体|口調/i.test(value)) return "tone";
  if (/\.xlsx|excel/i.test(value)) return "excel_format";
  if (/16\s*:\s*9|pptx|powerpoint/i.test(value)) return "pptx_format";
  if (/1日\s*\d|投稿.*件/i.test(value)) return "posting_cadence";
  return `pref_${hashKey(value)}`;
}

function hashKey(value: string): string {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h.toString(16).slice(0, 8);
}

function dedupeCandidates(items: SaveCandidate[]): SaveCandidate[] {
  const seen = new Set<string>();
  const out: SaveCandidate[] = [];
  for (const item of items) {
    const id = `${item.scope}:${item.key}:${item.value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}
