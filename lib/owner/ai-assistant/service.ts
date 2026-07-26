import "server-only";

import { isOpenAIConfigured } from "@/lib/openai";

import { detectCostAnomalies, buildManagementAlerts } from "./anomalies";
import {
  generateAiNarrative,
  toManagementSummary,
} from "./ai-narrative";
import { getAssistantAiCache, setAssistantAiCache } from "./cache";
import { buildForecasts } from "./forecast";
import { buildAssistantFacts, hashAssistantFacts } from "./facts";
import { buildHqSimulations, buildPriceChangeScenarios } from "./hq-simulator";
import {
  buildPlanProposals,
  buildProfitInsights,
  buildQualityInsights,
  buildRuleSuggestions,
  buildRuleSummaryBullets,
  buildUserInsights,
} from "./insights";
import type { AiAssistantSnapshot, AiSuggestion, AssistantPeriod } from "./types";

export async function getAiAssistantSnapshot(input: {
  period?: AssistantPeriod;
  /** When true, bypass cache and call OpenAI (owner-triggered). */
  refreshAi?: boolean;
  now?: Date;
}): Promise<AiAssistantSnapshot> {
  const period = input.period ?? "month";
  const now = input.now ?? new Date();
  const facts = await buildAssistantFacts(period, now);
  const factsHash = hashAssistantFacts(facts);

  const profitInsights = buildProfitInsights(facts);
  const anomalies = detectCostAnomalies(facts);
  const alerts = buildManagementAlerts(facts, anomalies);
  const hqSimulations = buildHqSimulations(facts);
  const priceScenarios = buildPriceChangeScenarios(facts);
  const planProposals = buildPlanProposals(facts);
  const userInsights = buildUserInsights(facts);
  const qualityInsights = buildQualityInsights(facts);
  const forecasts = buildForecasts(facts);
  const ruleSuggestions = buildRuleSuggestions(facts, qualityInsights);
  const bullets = buildRuleSummaryBullets(facts);

  const aiConfigured = isOpenAIConfigured();
  let suggestions: AiSuggestion[] = [...ruleSuggestions];
  let summary = toManagementSummary({
    period,
    bullets,
    narrative: bullets.join("。") + "。",
    source: "rules",
    cached: false,
    aiAvailable: aiConfigured,
    aiSkippedReason: aiConfigured
      ? "キャッシュ利用または未実行（再分析でAI要約を生成）"
      : "OPENAI_API_KEY 未設定のためルールベース要約のみ",
  });

  const cached = getAssistantAiCache(period, factsHash);
  if (cached && !input.refreshAi) {
    summary = {
      ...cached.summary,
      bullets,
      cached: true,
      aiAvailable: aiConfigured,
    };
    if (cached.aiSuggestions.length > 0) {
      suggestions = [
        ...cached.aiSuggestions.map(
          (body, index): AiSuggestion => ({
            id: `ai_${index}`,
            priority: index === 0 ? "high" : "medium",
            title: "AI改善提案",
            body,
            source: "ai",
          }),
        ),
        ...ruleSuggestions,
      ];
      summary = { ...summary, source: "mixed" };
    }
  } else if (input.refreshAi && aiConfigured) {
    const ai = await generateAiNarrative(facts);
    if (ai.ok) {
      summary = toManagementSummary({
        period,
        bullets,
        narrative: ai.result.narrative,
        source: "mixed",
        cached: false,
        aiAvailable: true,
        aiSkippedReason: null,
      });
      const aiSuggestions = ai.result.suggestions;
      setAssistantAiCache({
        period,
        factsHash,
        summary,
        aiSuggestions,
      });
      suggestions = [
        ...aiSuggestions.map(
          (body, index): AiSuggestion => ({
            id: `ai_${index}`,
            priority: index === 0 ? "high" : "medium",
            title: "AI改善提案",
            body,
            source: "ai",
          }),
        ),
        ...ruleSuggestions,
      ];
    } else {
      summary = toManagementSummary({
        period,
        bullets,
        narrative: bullets.join("。") + "。",
        source: "rules",
        cached: false,
        aiAvailable: true,
        aiSkippedReason: ai.reason,
      });
    }
  } else if (!aiConfigured) {
    summary = {
      ...summary,
      aiSkippedReason: "OPENAI_API_KEY 未設定のためルールベース分析のみ",
    };
  }

  // Deduplicate suggestion bodies
  const seen = new Set<string>();
  suggestions = suggestions.filter((s) => {
    const key = s.body.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    period,
    generatedAt: now.toISOString(),
    summary,
    profitInsights,
    anomalies,
    alerts,
    hqSimulations,
    priceScenarios,
    planProposals,
    userInsights,
    qualityInsights,
    forecasts,
    suggestions,
    factsHash,
    dataNotes: facts.dataNotes,
  };
}
