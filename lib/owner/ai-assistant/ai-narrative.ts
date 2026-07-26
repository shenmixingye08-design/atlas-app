import "server-only";

import { createAtlasResponse, isOpenAIConfigured } from "@/lib/openai";
import { recordApiUsage } from "@/lib/owner/api-usage/store";
import { resolveTaskPolicy } from "@/lib/ai/policy-engine";

import type { AssistantFacts } from "./facts";
import type { AssistantPeriod, ManagementSummary } from "./types";

export type AiNarrativeResult = {
  narrative: string;
  suggestions: string[];
  costUsd: number | null;
};

function periodLabel(period: AssistantPeriod): string {
  if (period === "day") return "日次";
  if (period === "week") return "週次";
  return "月次";
}

function buildPrompt(facts: AssistantFacts): string {
  const payload = {
    period: periodLabel(facts.period),
    revenueJpy: facts.current.revenueJpy,
    apiCostUsd: facts.current.apiCostUsd,
    previousApiCostUsd: facts.previous.apiCostUsd,
    marginPercent: facts.marginPercent,
    profitJpy: facts.profitJpy,
    mrrJpy: facts.mrrJpy,
    paidUsers: facts.paidUsers,
    freeUsers: facts.freeUsers,
    churnRatePercent: facts.churnRatePercent,
    arpuJpy: facts.arpuJpy,
    ltvJpy: facts.ltvJpy,
    hqUsageSharePercent: facts.hqUsageSharePercent,
    topDeliverable: facts.topDeliverable,
    highestMarginDeliverable: facts.highestMarginDeliverable,
    risingCostDeliverable: facts.risingCostDeliverable,
    visionRequests: facts.current.visionRequests,
    errorRatePercent: facts.current.errorRatePercent,
    growthRateMonthly: facts.growthRateMonthly,
    planBreakdown: facts.planBreakdown,
    dataNotes: facts.dataNotes,
  };

  return [
    "あなたはMINERVOTのオーナー向け経営アシスタントです。",
    "以下の実データJSONだけを根拠に、日本語で簡潔に分析してください。",
    "数値の捏造・推測の断定は禁止。データがない項目は触れないでください。",
    "出力は必ず次のJSONのみ:",
    '{"narrative":"3〜6文の経営サマリー","suggestions":["改善提案1","改善提案2","改善提案3"]}',
    "suggestionsは最大5件。具体的なアクションを含める。",
    "",
    JSON.stringify(payload),
  ].join("\n");
}

function estimateCostUsd(inputChars: number, outputChars: number): number {
  const policy = resolveTaskPolicy("research_synthesis");
  const inTok = Math.ceil(inputChars / 4);
  const outTok = Math.ceil(outputChars / 4);
  return (
    (inTok / 1_000_000) * policy.inputPricePerMillion +
    (outTok / 1_000_000) * policy.outputPricePerMillion
  );
}

function parseNarrative(text: string): AiNarrativeResult | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const json = JSON.parse(trimmed.slice(start, end + 1)) as {
      narrative?: unknown;
      suggestions?: unknown;
    };
    if (typeof json.narrative !== "string" || !json.narrative.trim()) {
      return null;
    }
    const suggestions = Array.isArray(json.suggestions)
      ? json.suggestions
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .slice(0, 5)
      : [];
    return {
      narrative: json.narrative.trim(),
      suggestions,
      costUsd: null,
    };
  } catch {
    return null;
  }
}

export async function generateAiNarrative(
  facts: AssistantFacts,
): Promise<
  | { ok: true; result: AiNarrativeResult }
  | { ok: false; reason: string }
> {
  if (!isOpenAIConfigured()) {
    return { ok: false, reason: "OPENAI_API_KEY 未設定" };
  }

  const input = buildPrompt(facts);
  try {
    const response = await createAtlasResponse({
      input,
      instructions:
        "MINERVOT owner executive analyst. Reply with JSON only. No markdown.",
      aiTaskType: "research_synthesis",
      maxOutputTokens: 900,
    });
    const text = response.output_text?.trim() ?? "";
    const parsed = parseNarrative(text);
    if (!parsed) {
      return { ok: false, reason: "AI応答のJSON解析に失敗" };
    }
    const costUsd =
      Math.round(estimateCostUsd(input.length, text.length) * 10_000) / 10_000;
    if (costUsd > 0) {
      recordApiUsage({
        providerId: "openai",
        amountUsd: costUsd,
        source: "external",
      });
    }
    return { ok: true, result: { ...parsed, costUsd } };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "OpenAI呼び出し失敗";
    return { ok: false, reason: message };
  }
}

export function toManagementSummary(input: {
  period: AssistantPeriod;
  bullets: readonly string[];
  narrative: string | null;
  source: ManagementSummary["source"];
  cached: boolean;
  aiAvailable: boolean;
  aiSkippedReason: string | null;
}): ManagementSummary {
  return {
    period: input.period,
    bullets: input.bullets,
    narrative: input.narrative,
    source: input.source,
    generatedAt: new Date().toISOString(),
    cached: input.cached,
    aiAvailable: input.aiAvailable,
    aiSkippedReason: input.aiSkippedReason,
  };
}
