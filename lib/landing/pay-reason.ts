/**
 * Honest pay-reason math for LP.
 * Uses sample typical-manual baselines only — never invents user outcomes.
 */

import {
  PROOF_EMAIL_SAMPLE,
  PROOF_SNS_SAMPLE,
} from "@/lib/landing/proof-samples";

/** Reference retail price for a typical canned coffee in Japan (yen). Labeled 参考. */
export const REFERENCE_CANNED_COFFEE_JPY = 130;

export const LIGHT_PLAN_JPY = 980;

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
    title: "毎朝のSNS投稿",
    when: "毎朝",
    request: "今日の投稿文を1件作って",
    typicalManualMinutes: PROOF_SNS_SAMPLE.typicalManualMinutes,
    future: "投稿準備に追われず、本業の営業や制作に入れる",
  },
  {
    id: "daily-email",
    title: "毎日のメール",
    when: "毎日",
    request: "フォローメールの下書きを作って",
    typicalManualMinutes: PROOF_EMAIL_SAMPLE.typicalManualMinutes,
    future: "朝の返信地獄が減り、家族や集中仕事の時間に回せる",
  },
  {
    id: "daily-doc",
    title: "毎日の資料",
    when: "毎日〜週次",
    request: "今日の共有資料の骨子を作って",
    typicalManualMinutes: 40,
    future: "白紙から組み立てる時間が消え、確認だけで進む",
  },
  {
    id: "daily-report",
    title: "毎日の報告書",
    when: "毎日〜週次",
    request: "今日の進捗報告をまとめて",
    typicalManualMinutes: 30,
    future: "退勤前の報告書ストレスが減る",
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
