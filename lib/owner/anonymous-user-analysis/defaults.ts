import type { PlanId } from "@/lib/billing/plans/types";
import type { PopularityFeatureId } from "@/lib/owner/popularity-ranking/types";

import type { AnonymousUserRow } from "./types";

type EstimatedUserSeed = {
  anonymousUserId: string;
  planId: PlanId;
  planLabel: string;
  apiCostUsd: number;
  profitMarginPercent: number | null;
  featuresUsed: readonly string[];
  usageCount: number;
  isHighCost: boolean;
};

const ESTIMATED_USERS: readonly EstimatedUserSeed[] = [
  {
    anonymousUserId: "anon_e3f1a9b2c0",
    planId: "premium",
    planLabel: "Premium",
    apiCostUsd: 0.42,
    profitMarginPercent: 58,
    featuresUsed: ["SNS", "ブログ", "動画"],
    usageCount: 28,
    isHighCost: true,
  },
  {
    anonymousUserId: "anon_a7d4e8f1b3",
    planId: "standard",
    planLabel: "Standard",
    apiCostUsd: 0.18,
    profitMarginPercent: 72,
    featuresUsed: ["SNS", "営業資料"],
    usageCount: 14,
    isHighCost: false,
  },
  {
    anonymousUserId: "anon_c2b5f0d9e6",
    planId: "light",
    planLabel: "Light",
    apiCostUsd: 0.06,
    profitMarginPercent: 81,
    featuresUsed: ["SNS"],
    usageCount: 9,
    isHighCost: false,
  },
  {
    anonymousUserId: "anon_9f3c1a7d4e",
    planId: "free",
    planLabel: "Free",
    apiCostUsd: 0.03,
    profitMarginPercent: null,
    featuresUsed: ["ブログ"],
    usageCount: 4,
    isHighCost: false,
  },
  {
    anonymousUserId: "anon_b8e2f5a1c7",
    planId: "standard",
    planLabel: "Standard",
    apiCostUsd: 0.31,
    profitMarginPercent: 45,
    featuresUsed: ["SNS", "メール", "Google連携"],
    usageCount: 22,
    isHighCost: true,
  },
];

export function buildEstimatedAnonymousUserRows(): AnonymousUserRow[] {
  return ESTIMATED_USERS.map((user) => ({
    ...user,
    isEstimated: true,
  }));
}

export const HIGH_COST_API_USD_THRESHOLD = 0.25;
export const HIGH_COST_MARGIN_THRESHOLD = 20;

export const ESTIMATED_FEATURE_LABELS: Record<PopularityFeatureId, string> = {
  sns: "SNS",
  blog: "ブログ",
  sales_material: "営業資料",
  email: "メール",
  google: "Google連携",
  dropbox: "Dropbox",
  video: "動画",
  image: "画像",
};
