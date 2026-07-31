/**
 * Phase6 — 正式公開判定の数値基準（感覚・レビュー禁止）。
 * 正本: docs/development/phase6-launch-verdict.md
 */

export type LaunchKpiId =
  | "firstCompletionRate"
  | "jobCompletionRate"
  | "errorRate"
  | "avgCompletionSeconds"
  | "retention7"
  | "retention30"
  | "referralRate"
  | "paidConversionRate"
  | "nps";

export type LaunchBand = "go" | "delay" | "kill";

export type LaunchKpiDefinition = {
  id: LaunchKpiId;
  label: string;
  /** Higher is better (rates, NPS) vs lower is better (error, time). */
  direction: "higher" | "lower";
  unit: "percent" | "seconds" | "score";
  /** 重大KPI — 中止なら公開禁止 */
  critical: boolean;
  go: { min?: number; max?: number };
  delay: { min?: number; max?: number };
  kill: { min?: number; max?: number };
};

/**
 * 公開 = すべて go。延期 = いずれか delay（重大 kill なし）。
 * 公開禁止 = 重大KPIが kill。
 */
export const LAUNCH_KPI_DEFINITIONS: readonly LaunchKpiDefinition[] = [
  {
    id: "firstCompletionRate",
    label: "初回成功率",
    direction: "higher",
    unit: "percent",
    critical: true,
    go: { min: 95 },
    delay: { min: 85, max: 94.999 },
    kill: { max: 84.999 },
  },
  {
    id: "jobCompletionRate",
    label: "仕事完了率",
    direction: "higher",
    unit: "percent",
    critical: true,
    go: { min: 90 },
    delay: { min: 70, max: 89.999 },
    kill: { max: 69.999 },
  },
  {
    id: "errorRate",
    label: "エラー率",
    direction: "lower",
    unit: "percent",
    critical: true,
    go: { max: 2 },
    delay: { min: 2.001, max: 8 },
    kill: { min: 8.001 },
  },
  {
    id: "avgCompletionSeconds",
    label: "平均処理時間",
    direction: "lower",
    unit: "seconds",
    critical: false,
    go: { max: 180 },
    delay: { min: 180.001, max: 420 },
    kill: { min: 420.001 },
  },
  {
    id: "retention7",
    label: "7日継続率",
    direction: "higher",
    unit: "percent",
    critical: true,
    go: { min: 40 },
    delay: { min: 20, max: 39.999 },
    kill: { max: 19.999 },
  },
  {
    id: "retention30",
    label: "30日継続率",
    direction: "higher",
    unit: "percent",
    critical: false,
    go: { min: 25 },
    delay: { min: 12, max: 24.999 },
    kill: { max: 11.999 },
  },
  {
    id: "referralRate",
    label: "紹介率",
    direction: "higher",
    unit: "percent",
    critical: false,
    go: { min: 25 },
    delay: { min: 10, max: 24.999 },
    kill: { max: 9.999 },
  },
  {
    id: "paidConversionRate",
    label: "課金率",
    direction: "higher",
    unit: "percent",
    critical: false,
    go: { min: 8 },
    delay: { min: 3, max: 7.999 },
    kill: { max: 2.999 },
  },
  {
    id: "nps",
    label: "NPS",
    direction: "higher",
    unit: "score",
    critical: true,
    go: { min: 30 },
    delay: { min: 0, max: 29.999 },
    kill: { max: -0.001 },
  },
] as const;

/** 判定に必要な最低サンプル（これ未満は延期 = データ不足） */
export const LAUNCH_MIN_SAMPLES = {
  jobs: 50,
  firstRunUsers: 50,
  npsResponses: 30,
} as const;
