import type { FirstUsecaseId, PainChoice } from "./types";

export type { FirstUsecaseId, PainChoice };

/**
 * 無料プランで実在する機能だけ。blog_creation / google_integration は出さない。
 * スケジュールは Google 連携が Standard 以上のため、案内は「タスク整理」に限定。
 */
export const FIRST_USECASES: Array<{
  id: FirstUsecaseId;
  label: string;
  href: string;
  firstExperienceTask: "sns" | "sales_material" | "email" | null;
  sampleOnly: boolean;
  note: string;
}> = [
  {
    id: "sns",
    label: "X投稿案を作る",
    href: "/workspace/x",
    firstExperienceTask: "sns",
    sampleOnly: false,
    note: "Free でも投稿文の作成を依頼できます。自動投稿は X 連携後です。",
  },
  {
    id: "automation",
    label: "定期作業を自動化する",
    href: "/automations",
    firstExperienceTask: null,
    sampleOnly: false,
    note: "Free は自動化 1件まで。画面から自分で作成します。",
  },
  {
    id: "document",
    label: "資料のアウトラインを作る",
    href: "/projects",
    firstExperienceTask: "sales_material",
    sampleOnly: false,
    note: "アウトライン作成まで。PowerPoint エンジンは未提供です。",
  },
  {
    id: "schedule",
    label: "今日の作業を整理する",
    href: "/today",
    firstExperienceTask: "email",
    sampleOnly: false,
    note: "タスクの整理。Googleカレンダー連携は Standard 以上です。",
  },
];

export const PAIN_CHOICES: Array<{ id: PainChoice; label: string }> = [
  { id: "repeat_work", label: "毎週・毎月の繰り返し作業" },
  { id: "sns_posting", label: "X投稿が続かない" },
  { id: "documents", label: "資料作りに時間がかかる" },
  { id: "schedule", label: "予定と依頼の整理" },
];

export function usecasesForPain(pain: PainChoice): typeof FIRST_USECASES {
  if (pain === "sns_posting") return FIRST_USECASES.filter((row) => row.id === "sns");
  if (pain === "documents") return FIRST_USECASES.filter((row) => row.id === "document");
  if (pain === "schedule") return FIRST_USECASES.filter((row) => row.id === "schedule");
  return FIRST_USECASES;
}

export function timeToFirstMs(
  startedAt: string | null,
  reachedAt: string | null,
): number | null {
  if (!startedAt || !reachedAt) return null;
  const a = Date.parse(startedAt);
  const b = Date.parse(reachedAt);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return b - a;
}
