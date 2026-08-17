/**
 * Honest pay-reason math for LP.
 * Uses sample typical-manual baselines only — never invents user outcomes.
 */

import { getPlanDefinition } from "@/lib/billing/plans/registry";
import {
  PROOF_EMAIL_SAMPLE,
  PROOF_SNS_SAMPLE,
} from "@/lib/landing/proof-samples";

/** Reference retail price for a typical canned coffee in Japan (yen). Labeled 参考. */
export const REFERENCE_CANNED_COFFEE_JPY = 130;

/** Same yen amount as Plan Registry Light — never a second price source. */
export const LIGHT_PLAN_JPY = getPlanDefinition("light").monthlyPriceJpy;

export function lightPlanYenLabel(): string {
  return `${LIGHT_PLAN_JPY.toLocaleString("ja-JP")}円`;
}

/** Weekday assumption for sample monthly math (見本定義). */
export const SAMPLE_WORKDAYS_PER_MONTH = 20;

export type SampleDailyHabit = {
  id: string;
  title: string;
  when: string;
  request: string;
  typicalManualMinutes: number;
  future: string;
};

export const SAMPLE_DAILY_HABITS: readonly SampleDailyHabit[] = [
  {
    id: "morning-sns",
    title: "X投稿の作成・自動化",
    when: "毎朝",
    request: "今日のX投稿を3案作って",
    typicalManualMinutes: PROOF_SNS_SAMPLE.typicalManualMinutes,
    future: "投稿準備をMINERVOTに任せ、自分は確認するだけ",
  },
  {
    id: "daily-report",
    title: "繰り返し作業の自動化",
    when: "毎日〜毎週",
    request: "毎週この作業を自動で実行して",
    typicalManualMinutes: 30,
    future: "決まった作業を任せ、自分は確認するだけ",
  },
  {
    id: "daily-email",
    title: "メール作成と予定管理",
    when: "毎日",
    request: "この内容を取引先へのメールにして",
    typicalManualMinutes: PROOF_EMAIL_SAMPLE.typicalManualMinutes,
    future: "下書きと予定登録を任せ、自分は確認するだけ",
  },
  {
    id: "daily-doc",
    title: "資料・成果物の作成",
    when: "毎日〜週次",
    request: "このデータをExcelにまとめて",
    typicalManualMinutes: 40,
    future: "資料づくりを任せ、自分は確認するだけ",
  },
] as const;

/** Sample: daily email on workdays using declared typical minutes. */
export function sampleMonthlyEmailMinutes(): number {
  return PROOF_EMAIL_SAMPLE.typicalManualMinutes * SAMPLE_WORKDAYS_PER_MONTH;
}

/** Sample: daily SNS every day using declared typical minutes. */
export function sampleMonthlySnsMinutes(): number {
  return PROOF_SNS_SAMPLE.typicalManualMinutes * 30;
}

/** Sample: email (workdays) + SNS (daily) combined. */
export function sampleMonthlyCombinedMinutes(): number {
  return sampleMonthlyEmailMinutes() + sampleMonthlySnsMinutes();
}

export function minutesToHoursLabel(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}時間`;
}

export function coffeeCansForLightPlan(): number {
  return Math.round((LIGHT_PLAN_JPY / REFERENCE_CANNED_COFFEE_JPY) * 10) / 10;
}

export const PAY_REASON_DISCLAIMER =
  "時間の数字は見本の手作業目安（SNS15分・メール10分など）からの計算です。特定ユーザーの実測ではありません。缶コーヒー比較は一般的な売価約130円を参考にした換算です。";
