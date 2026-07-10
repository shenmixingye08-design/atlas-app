import type { OrchestrationResult } from "@/lib/orchestration/types";
import { getDeliverablePreviewText } from "@/lib/orchestration/deliverable-types";
import { analyzeContentSignals } from "@/lib/pr/generate-strategy";
import type { PrReview } from "@/lib/pr/types";
import { ui } from "@/lib/i18n";

import {
  GROWTH_EXTENSION_STUBS,
  type ChannelEffectEstimate,
  type GrowthImpactAssessment,
  type GrowthReview,
  type ImpactLevel,
} from "./types";

function corpus(result: OrchestrationResult): string {
  return [
    result.assignment,
    result.finalResponse,
    getDeliverablePreviewText(result.deliverable),
    result.research?.report?.executiveSummary ?? "",
  ]
    .join("\n")
    .toLowerCase();
}

function clampLevel(score: number): ImpactLevel {
  if (score >= 3) return "high";
  if (score >= 2) return "medium";
  return "low";
}

function channelRank(
  strategy: NonNullable<PrReview["strategy"]>,
  id: ChannelEffectEstimate["id"],
): number {
  const found = strategy.channelPriority.find((c) => c.id === id);
  return found?.rank ?? 99;
}

function buildImpacts(
  prReview: PrReview,
  strategy: NonNullable<PrReview["strategy"]>,
  signals: ReturnType<typeof analyzeContentSignals>,
): GrowthImpactAssessment {
  const priorityCount = strategy.channelPriority.length;
  const hasBlog = strategy.channelPriority.some((c) => c.id === "blog");
  const hasX = strategy.channelPriority.some((c) => c.id === "x");
  const hasLinkedIn = strategy.channelPriority.some((c) => c.id === "linkedin");
  const top = strategy.channelPriority[0]?.id;

  const expectsNewUsers = strategy.expectedEffects.some((effect) =>
    effect.includes(ui.pr.effectNewUserAcquisition),
  );
  const expectsBrand = strategy.expectedEffects.some((effect) =>
    effect.includes(ui.pr.effectBrandAwareness),
  );
  const expectsSeo = strategy.expectedEffects.some((effect) =>
    effect.includes(ui.pr.effectSeoTraffic),
  );

  let reachScore = priorityCount >= 3 ? 3 : priorityCount === 2 ? 2 : 1;
  if (signals.isHighPriority) reachScore += 1;

  let engagementScore = 1;
  if (hasX && top === "x") engagementScore = 3;
  else if (hasX) engagementScore = 2;
  else if (hasLinkedIn) engagementScore = 2;

  let seoScore = 1;
  if (hasBlog && top === "blog") seoScore = 3;
  else if (hasBlog || expectsSeo) seoScore = 2;

  let acquisitionScore = 1;
  if (expectsNewUsers && signals.isFeatureLaunch) acquisitionScore = 3;
  else if (expectsNewUsers || signals.isFeatureLaunch) acquisitionScore = 2;

  let brandScore = 1;
  if (expectsBrand && priorityCount >= 2) brandScore = 3;
  else if (expectsBrand || signals.isBehindTheScenes) brandScore = 2;

  let confidenceScore = 2;
  if (signals.hasCompetitorResearch && signals.hasHighQuality) confidenceScore = 3;
  else if (!signals.hasCompetitorResearch && prReview.priority === "low") {
    confidenceScore = 1;
  }

  return {
    reach: clampLevel(reachScore),
    engagement: clampLevel(engagementScore),
    seoValue: clampLevel(seoScore),
    userAcquisition: clampLevel(acquisitionScore),
    brandAwareness: clampLevel(brandScore),
    confidence: clampLevel(confidenceScore),
  };
}

function buildChannelEffects(
  strategy: NonNullable<PrReview["strategy"]>,
): ChannelEffectEstimate[] {
  const effects: ChannelEffectEstimate[] = [];

  const blogRank = channelRank(strategy, "blog");
  if (blogRank <= 3) {
    effects.push({
      id: "blog",
      label: ui.growth.channelBlog,
      metric: ui.growth.metricSeo,
      level: blogRank === 1 ? "high" : blogRank === 2 ? "medium" : "low",
    });
  }

  const xRank = channelRank(strategy, "x");
  if (xRank <= 3) {
    effects.push({
      id: "x",
      label: ui.growth.channelX,
      metric: ui.growth.metricEngagement,
      level: xRank === 1 ? "high" : xRank === 2 ? "medium" : "low",
    });
  }

  const linkedInRank = channelRank(strategy, "linkedin");
  if (linkedInRank <= 3) {
    effects.push({
      id: "linkedin",
      label: ui.growth.channelLinkedIn,
      metric: ui.growth.metricBrand,
      level: linkedInRank === 1 ? "high" : linkedInRank === 2 ? "medium" : "low",
    });
  }

  const emailRecommended = strategy.channelPriority.some((c) => c.id === "email");
  const emailRank = channelRank(strategy, "email");
  if (emailRecommended || emailRank <= 3) {
    effects.push({
      id: "email",
      label: ui.growth.channelEmail,
      metric: ui.growth.metricEmail,
      level: emailRank <= 2 ? "medium" : "low",
    });
  }

  return effects.slice(0, 4);
}

function buildStrengths(
  strategy: NonNullable<PrReview["strategy"]>,
  impacts: GrowthImpactAssessment,
): string[] {
  const strengths: string[] = [];

  if (impacts.seoValue === "high") strengths.push(ui.growth.strengthSeo);
  if (impacts.engagement === "high" || impacts.engagement === "medium") {
    strengths.push(ui.growth.strengthEngagement);
  }
  if (strategy.audiences.length >= 2) {
    strengths.push(ui.growth.strengthAudience);
  }
  if (strategy.campaignTitle) {
    strengths.push(ui.growth.strengthCampaign(strategy.campaignTitle));
  }
  if (strategy.channelPriority.length >= 2) {
    strengths.push(ui.growth.strengthMultiChannel);
  }

  if (strengths.length === 0) {
    strengths.push(ui.growth.strengthDefault);
  }

  return strengths.slice(0, 3);
}

function buildWeaknesses(
  strategy: NonNullable<PrReview["strategy"]>,
  impacts: GrowthImpactAssessment,
): string[] {
  const weaknesses: string[] = [];

  if (impacts.confidence === "low") {
    weaknesses.push(ui.growth.weaknessLowConfidence);
  }
  if (impacts.engagement === "low") {
    weaknesses.push(ui.growth.weaknessEngagement);
  }
  if (
    strategy.channelPriority.some((c) => c.id === "email") &&
    channelRank(strategy, "email") >= 3
  ) {
    weaknesses.push(ui.growth.weaknessEmail);
  }
  if (strategy.timing === ui.pr.timingSeries && impacts.reach === "low") {
    weaknesses.push(ui.growth.weaknessSeriesTiming);
  }
  if (impacts.userAcquisition === "low") {
    weaknesses.push(ui.growth.weaknessAcquisition);
  }

  if (weaknesses.length === 0) {
    weaknesses.push(ui.growth.weaknessDefault);
  }

  return weaknesses.slice(0, 3);
}

function buildImprovements(
  strategy: NonNullable<PrReview["strategy"]>,
  impacts: GrowthImpactAssessment,
): string[] {
  const improvements: string[] = [];
  const top = strategy.channelPriority[0];
  const second = strategy.channelPriority[1];

  if (top?.id === "blog") {
    improvements.push(ui.growth.improveBlogPrimary);
    if (second?.id === "x") {
      improvements.push(ui.growth.improveXSecondary);
    }
  } else if (top?.id === "x") {
    improvements.push(ui.growth.improveXPrimary);
    if (second) {
      improvements.push(ui.growth.improveChannelSecondary(second.label));
    }
  } else if (top) {
    improvements.push(ui.growth.improveChannelPrimary(top.label));
  }

  if (impacts.seoValue === "low" && strategy.channelPriority.some((c) => c.id === "blog")) {
    improvements.push(ui.growth.improveSeoContent);
  }
  if (impacts.brandAwareness === "low") {
    improvements.push(ui.growth.improveBrandStory);
  }

  return [...new Set(improvements)].slice(0, 3);
}

function buildNextTests(
  strategy: NonNullable<PrReview["strategy"]>,
  impacts: GrowthImpactAssessment,
): string[] {
  const tests: string[] = [];

  if (strategy.channelPriority[0]?.id === "blog") {
    tests.push(ui.growth.testBlogHeadline);
  }
  if (strategy.channelPriority.some((c) => c.id === "x")) {
    tests.push(ui.growth.testXTiming);
  }
  if (impacts.userAcquisition !== "high") {
    tests.push(ui.growth.testLandingCta);
  }
  if (strategy.audiences.length >= 2) {
    tests.push(ui.growth.testAudienceMessage);
  }
  if (impacts.confidence !== "high") {
    tests.push(ui.growth.testChannelMix);
  }

  if (tests.length === 0) {
    tests.push(ui.growth.testDefault);
  }

  return tests.slice(0, 3);
}

function buildRecommendation(
  strategy: NonNullable<PrReview["strategy"]>,
): string {
  const top = strategy.channelPriority[0];
  const second = strategy.channelPriority[1];

  if (!top) return ui.growth.recommendationDefault;

  if (top.id === "blog" && second?.id === "x") {
    return ui.growth.recommendBlogAndX;
  }
  if (top.id === "blog" && second) {
    return ui.growth.recommendBlogWithSecondary(second.label);
  }
  if (top.id === "x" && second) {
    return ui.growth.recommendXWithSecondary(second.label);
  }

  return ui.growth.recommendChannelPrimary(top.label);
}

function buildSummary(
  prReview: PrReview,
  strategy: NonNullable<PrReview["strategy"]>,
  impacts: GrowthImpactAssessment,
): string {
  const top = strategy.channelPriority[0]?.label ?? ui.growth.channelBlog;

  if (impacts.seoValue === "high" && impacts.engagement === "medium") {
    return ui.growth.summarySeoEngagement(top);
  }
  if (impacts.userAcquisition === "high") {
    return ui.growth.summaryAcquisition(strategy.campaignTitle);
  }
  if (impacts.brandAwareness === "high") {
    return ui.growth.summaryBrand;
  }

  return ui.growth.summaryDefault(prReview.headline, top);
}

/** Evaluate PR strategy effectiveness (planning-only — no live analytics). */
export function generateGrowthReview(
  prReview: PrReview,
  result: OrchestrationResult,
): GrowthReview | null {
  if (!prReview.shouldShare || !prReview.strategy) {
    return null;
  }

  const strategy = prReview.strategy;
  const signals = analyzeContentSignals(result, corpus(result));
  const impacts = buildImpacts(prReview, strategy, signals);
  const channelEffects = buildChannelEffects(strategy);

  return {
    summary: buildSummary(prReview, strategy, impacts),
    impacts,
    channelEffects,
    strengths: buildStrengths(strategy, impacts),
    weaknesses: buildWeaknesses(strategy, impacts),
    improvements: buildImprovements(strategy, impacts),
    nextTests: buildNextTests(strategy, impacts),
    recommendation: buildRecommendation(strategy),
    extensions: GROWTH_EXTENSION_STUBS,
  };
}
