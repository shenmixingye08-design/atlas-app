/**
 * Phase5 §6 — 月額980円（Light）の価値・原価試算。
 * 感覚ではなく利用回数と想定原価で計算。原価は概算（モデル単価変動あり）。
 */

import { getPlanDefinition } from "@/lib/billing/plans/registry";

export type UsagePersona = {
  id: "light5" | "light20" | "daily";
  label: string;
  runsPerMonth: number;
  minutesSavedPerRun: number;
  hourlyWageJpy: number;
};

export const VALUE_PERSONAS: readonly UsagePersona[] = [
  {
    id: "light5",
    label: "月5回",
    runsPerMonth: 5,
    minutesSavedPerRun: 15,
    hourlyWageJpy: 2000,
  },
  {
    id: "light20",
    label: "月20回",
    runsPerMonth: 20,
    minutesSavedPerRun: 15,
    hourlyWageJpy: 2000,
  },
  {
    id: "daily",
    label: "毎日（30回）",
    runsPerMonth: 30,
    minutesSavedPerRun: 12,
    hourlyWageJpy: 2000,
  },
] as const;

/** 概算原価（JPY）。OpenAI+Storageの中央値想定。要モニタリング。 */
export const COST_ASSUMPTIONS = {
  avgCostPerTextRunJpy: 8,
  avgCostPerVisionRunJpy: 25,
  storagePerRunJpy: 1,
  overheadPerUserMonthJpy: 40,
  priceLightJpy: getPlanDefinition("light").monthlyPriceJpy,
  freeAiRuns: getPlanDefinition("free").limits.aiUsageMonthly,
  lightAiRuns: getPlanDefinition("light").limits.aiUsageMonthly,
  /** Vision比率仮定（依頼の20%が画像） */
  visionShare: 0.2,
} as const;

export type PersonaEconomics = {
  personaId: string;
  runs: number;
  minutesSaved: number;
  timeValueJpy: number;
  estimatedCogsJpy: number;
  grossMarginJpy: number;
  valueMultipleVsPrice: number;
};

export function estimateRunCogsJpy(visionShare = COST_ASSUMPTIONS.visionShare): number {
  const text = COST_ASSUMPTIONS.avgCostPerTextRunJpy;
  const vision = COST_ASSUMPTIONS.avgCostPerVisionRunJpy;
  return (
    text * (1 - visionShare) +
    vision * visionShare +
    COST_ASSUMPTIONS.storagePerRunJpy
  );
}

export function computePersonaEconomics(
  persona: UsagePersona
): PersonaEconomics {
  const cogsPer = estimateRunCogsJpy();
  const minutesSaved = persona.runsPerMonth * persona.minutesSavedPerRun;
  const timeValueJpy = (minutesSaved / 60) * persona.hourlyWageJpy;
  const estimatedCogsJpy =
    persona.runsPerMonth * cogsPer + COST_ASSUMPTIONS.overheadPerUserMonthJpy;
  const price = COST_ASSUMPTIONS.priceLightJpy;
  return {
    personaId: persona.id,
    runs: persona.runsPerMonth,
    minutesSaved,
    timeValueJpy: Math.round(timeValueJpy),
    estimatedCogsJpy: Math.round(estimatedCogsJpy),
    grossMarginJpy: Math.round(price - estimatedCogsJpy),
    valueMultipleVsPrice: Number((timeValueJpy / price).toFixed(2)),
  };
}

export function breakEvenHeavyRuns(): {
  maxRunsBeforeLoss: number;
  note: string;
} {
  const cogs = estimateRunCogsJpy();
  const price = COST_ASSUMPTIONS.priceLightJpy;
  const overhead = COST_ASSUMPTIONS.overheadPerUserMonthJpy;
  const max = Math.floor((price - overhead) / cogs);
  return {
    maxRunsBeforeLoss: max,
    note: `想定原価¥${cogs.toFixed(1)}/回のとき、Light料金で粗利ゼロ付近は約${max}回/月。プラン上限${COST_ASSUMPTIONS.lightAiRuns}回で制御`,
  };
}

export const FREE_TRIAL_PROPOSAL = {
  freeAiRuns: COST_ASSUMPTIONS.freeAiRuns,
  rationale: "初回にExcel/Word/PPTを1〜2回完成できる量（20回）",
  monthlyCapLight: COST_ASSUMPTIONS.lightAiRuns,
  visionSoftCap: 40,
  largeFileMb: 20,
  externalActionsLight: 30,
  overagePolicy: "上限到達で429＋アップセル。サイレント超過はしない",
  costGuard:
    "enforceAiRateLimit + requireBillingAiUsage + plan aiUsageMonthly。Visionは高単価のため利用割合をダッシュボード監視",
} as const;

export function pricingSummary() {
  const personas = VALUE_PERSONAS.map(computePersonaEconomics);
  const be = breakEvenHeavyRuns();
  return {
    priceJpy: COST_ASSUMPTIONS.priceLightJpy,
    personas,
    breakEven: be,
    freeTrial: FREE_TRIAL_PROPOSAL,
    publishValueOpinion:
      personas[1]!.valueMultipleVsPrice >= 3 &&
      personas[1]!.grossMarginJpy > 0
        ? ("conditional_yes" as const)
        : ("no" as const),
    publishValueReason:
      "月20回・15分短縮・時給2000円仮定で時間価値が料金を大きく上回る一方、本番E2E未検証のため「今すぐ一般公開YES」にはできない",
  };
}
