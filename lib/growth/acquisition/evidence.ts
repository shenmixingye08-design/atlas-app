import { getPlanDefinition, PLAN_DEFINITIONS } from "@/lib/billing/plans/registry";

import { getEvidenceStatusOverrides, setEvidenceStatusOverride } from "./store";
import type { EvidenceFact, EvidenceStatus } from "./types";

const FACTS: EvidenceFact[] = [
  {
    id: "sns_draft",
    title: "X投稿案の作成",
    fact: "Free でも X 向け投稿文の作成を依頼できます。自動投稿は X 連携後です。",
    status: "unverified",
    plans: ["free", "light", "standard", "premium"],
    limitLabel: `Free の X 自動投稿は月${getPlanDefinition("free").limits.xAutoPostsMonthly}件`,
    screenHref: "/workspace/x",
    measuredCount: null,
    userStoryAllowed: false,
    prohibited: ["架空の投稿成功数", "フォロワー増加の保証"],
  },
  {
    id: "automation_one",
    title: "自動化 1件",
    fact: "Free は自動化 1件まで。画面から自分で作成します。",
    status: "unverified",
    plans: ["free", "light", "standard", "premium"],
    limitLabel: `Free の自動化は${getPlanDefinition("free").limits.automationTasks}件`,
    screenHref: "/automations",
    measuredCount: null,
    userStoryAllowed: false,
    prohibited: ["無制限の自動化"],
  },
  {
    id: "document_outline",
    title: "資料アウトライン",
    fact: "営業資料のアウトライン作成まで。PowerPoint エンジンは未提供です。",
    status: "unverified",
    plans: ["free", "light", "standard", "premium"],
    limitLabel: null,
    screenHref: "/projects",
    measuredCount: null,
    userStoryAllowed: false,
    prohibited: ["PowerPointを自動で完成させる"],
  },
  {
    id: "today_tasks",
    title: "今日の作業整理",
    fact: "今日のタスク整理。Googleカレンダー連携は Standard 以上です。",
    status: "unverified",
    plans: ["free", "light", "standard", "premium"],
    limitLabel: null,
    screenHref: "/today",
    measuredCount: null,
    userStoryAllowed: false,
    prohibited: ["無料でカレンダー同期できる"],
  },
  {
    id: "pricing",
    title: "料金",
    fact: PLAN_DEFINITIONS.map(
      (plan) => `${plan.name} 月額${plan.monthlyPriceJpy}円`,
    ).join(" / "),
    status: "unverified",
    plans: ["free", "light", "standard", "premium"],
    limitLabel: null,
    screenHref: "/#pricing",
    measuredCount: null,
    userStoryAllowed: false,
    prohibited: ["期間限定の偽割引", "架空の利用者数"],
  },
];

export function listEvidenceFacts(): EvidenceFact[] {
  const overrides = getEvidenceStatusOverrides();
  return FACTS.map((row) => ({
    ...row,
    status: overrides[row.id] ?? row.status,
  }));
}

export function getEvidenceFact(id: string): EvidenceFact | null {
  return listEvidenceFacts().find((row) => row.id === id) ?? null;
}

export function setEvidenceStatus(id: string, status: EvidenceStatus): EvidenceFact | null {
  if (!FACTS.some((row) => row.id === id)) return null;
  setEvidenceStatusOverride(id, status);
  return getEvidenceFact(id);
}

export function marketingFacts(): EvidenceFact[] {
  return listEvidenceFacts().filter((row) => row.status === "approved_for_marketing");
}

export function claimStatusLabel(status: EvidenceStatus): string {
  switch (status) {
    case "approved_for_marketing":
      return "公開利用可";
    case "verified_production":
      return "本番確認済み";
    case "verified_preview":
      return "Preview確認のみ";
    case "rejected":
      return "却下";
    case "expired":
      return "期限切れ";
    default:
      return "未確認";
  }
}

export function assertiveCopyAllowed(status: EvidenceStatus): boolean {
  return status === "approved_for_marketing";
}
