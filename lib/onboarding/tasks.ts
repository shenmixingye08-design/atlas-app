import type { OnboardingTaskId } from "@/lib/user-profile/types";
import type { JobCategoryId } from "@/lib/user-profile/types";
import type { ExternalServiceId } from "@/lib/integrations/external-services/types";

export type OnboardingTaskDefinition = {
  id: OnboardingTaskId;
  icon: string;
  label: string;
  jobCategory: JobCategoryId;
  seedText: string;
  /** Maps to home frequent-work preset id when applicable. */
  presetId?: string;
  recommendedServices: ExternalServiceId[];
  automationHint?: string;
  settingsHref?: string;
};

export const ONBOARDING_TASKS: readonly OnboardingTaskDefinition[] = [
  {
    id: "sns",
    icon: "📱",
    label: "SNS投稿",
    jobCategory: "sns_post",
    seedText: "SNS投稿",
    presetId: "sns",
    recommendedServices: ["x"],
    automationHint: "SNS自動投稿",
    settingsHref: "/settings/x",
  },
  {
    id: "blog",
    icon: "📝",
    label: "ブログ",
    jobCategory: "blog",
    seedText: "ブログ記事",
    presetId: "blog",
    recommendedServices: ["wordpress", "google"],
    automationHint: "ブログ記事の定期作成",
    settingsHref: "/settings/google/drive",
  },
  {
    id: "sales_material",
    icon: "📄",
    label: "営業資料",
    jobCategory: "sales_material",
    seedText: "営業資料",
    presetId: "sales",
    recommendedServices: ["google"],
    automationHint: "営業資料AI",
    settingsHref: "/settings/google/drive",
  },
  {
    id: "email",
    icon: "📧",
    label: "メール整理",
    jobCategory: "email",
    seedText: "メール返信",
    presetId: "email",
    recommendedServices: ["google"],
    automationHint: "メール返信下書き",
    settingsHref: "/settings/google/gmail",
  },
  {
    id: "schedule",
    icon: "📅",
    label: "スケジュール管理",
    jobCategory: "generic",
    seedText: "スケジュール管理",
    presetId: "automation",
    recommendedServices: ["google"],
    automationHint: "定期仕事の自動実行",
    settingsHref: "/settings/google/calendar",
  },
  {
    id: "files",
    icon: "📂",
    label: "ファイル整理",
    jobCategory: "file_organize",
    seedText: "ファイル整理",
    presetId: "files",
    recommendedServices: ["google", "dropbox"],
    automationHint: "Driveへの自動保存",
    settingsHref: "/settings/google/drive",
  },
  {
    id: "ai_chat",
    icon: "📝",
    label: "追加依頼",
    jobCategory: "generic",
    seedText: "追加依頼",
    presetId: "consult",
    recommendedServices: [],
    settingsHref: "/chat",
  },
  {
    id: "company",
    icon: "🏢",
    label: "会社業務全般",
    jobCategory: "generic",
    seedText: "会社業務",
    recommendedServices: ["google"],
    automationHint: "業務の自動化",
    settingsHref: "/automations?create=1",
  },
  {
    id: "undecided",
    icon: "❓",
    label: "まだ決めていない",
    jobCategory: "generic",
    seedText: "",
    recommendedServices: [],
  },
] as const;

const TASK_BY_ID = Object.fromEntries(
  ONBOARDING_TASKS.map((task) => [task.id, task]),
) as Record<OnboardingTaskId, OnboardingTaskDefinition>;

export function getOnboardingTask(id: OnboardingTaskId): OnboardingTaskDefinition {
  return TASK_BY_ID[id];
}

export const ONBOARDING_TASK_IDS: OnboardingTaskId[] = ONBOARDING_TASKS.map(
  (task) => task.id,
);
