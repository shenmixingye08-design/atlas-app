import { getPlanDefinition } from "@/lib/billing/plans/registry";

import { ACQUISITION_CAMPAIGN_ID } from "./constants";
import { getUseCaseStatusOverrides, setUseCaseStatusOverride } from "./store";
import type { UseCasePageStatus, UseCaseSlug } from "./types";

export type UseCasePage = {
  slug: UseCaseSlug;
  title: string;
  description: string;
  audience: string;
  pain: string;
  oldSteps: string[];
  newSteps: string[];
  available: string[];
  unavailable: string[];
  faq: Array<{ q: string; a: string }>;
  firstJob: "sns" | "automation" | "document" | "schedule";
  contentId: string;
  status: UseCasePageStatus;
};

function prices(): string {
  const free = getPlanDefinition("free");
  const light = getPlanDefinition("light");
  const standard = getPlanDefinition("standard");
  const premium = getPlanDefinition("premium");
  return `${free.name} ${free.monthlyPriceJpy}円 / ${light.name} ${light.monthlyPriceJpy}円 / ${standard.name} ${standard.monthlyPriceJpy}円 / ${premium.name} ${premium.monthlyPriceJpy}円（税込表示。既存プラン定義）`;
}

const PAGES: UseCasePage[] = [
  {
    slug: "x-posts",
    title: "X投稿をAI秘書に任せる",
    description: "毎日の投稿文をゼロから考える作業を、MINERVOTの依頼に置き換える方法。",
    audience: "副業や個人事業で X 発信を続けたい人",
    pain: "投稿内容を毎回考え直し、下書きのまま止まる",
    oldSteps: ["テーマを思い出す", "文面を書く", "投稿するか迷う"],
    newSteps: ["最初の仕事で投稿案を1件依頼する", "内容を確認する", "X連携後に投稿を任せる"],
    available: ["X投稿案の作成（Freeでも依頼可）", "X連携後の自動投稿（月次上限あり）"],
    unavailable: ["フォロワー増加の保証", "未連携アカウントへの自動投稿"],
    faq: [
      { q: "無料で試せますか", a: "Free で投稿文の作成を1件依頼できます。" },
      { q: "すぐに投稿されますか", a: "自動投稿は X 連携と確認のあとです。" },
    ],
    firstJob: "sns",
    contentId: "ac_uc_x_posts",
    status: "draft",
  },
  {
    slug: "recurring-work",
    title: "毎週・毎月の定期作業を自動化する",
    description: "同じ手順の仕事を、自動化1件から減らし始める方法。",
    audience: "毎週同じ事務や確認を繰り返している個人事業主",
    pain: "同じ手順をカレンダーのたびにやり直す",
    oldSteps: ["手順を思い出す", "手で実行する", "抜け漏れを後から直す"],
    newSteps: ["自動化画面で1件作る", "実行結果を確認する", "必要なら定期実行を設定する"],
    available: ["自動化 1件（Free）", "依頼の再実行"],
    unavailable: ["無制限の同時自動化", "存在しない外部APIへの自動連携"],
    faq: [
      { q: "無料の上限は", a: `Free の自動化は ${getPlanDefinition("free").limits.automationTasks}件です。` },
    ],
    firstJob: "automation",
    contentId: "ac_uc_recurring",
    status: "draft",
  },
  {
    slug: "document-outlines",
    title: "資料のアウトライン作成を任せる",
    description: "提案資料の構成を先に作り、本文は確認して進める方法。",
    audience: "提案資料に時間がかかる個人事業主",
    pain: "白紙のスライドや文書から構成を考える",
    oldSteps: ["見出しを悩む", "箇条書きを並べる", "体裁を整える"],
    newSteps: ["アウトライン作成を依頼する", "見出しを確認する", "本文は手元で仕上げる"],
    available: ["営業資料のアウトライン作成"],
    unavailable: ["PowerPoint エンジンによる完成スライド自動生成", "根拠のない時間削減の数値"],
    faq: [
      { q: "PowerPointはできますか", a: "完成ファイルの自動生成は提供していません。アウトラインまでです。" },
    ],
    firstJob: "document",
    contentId: "ac_uc_documents",
    status: "draft",
  },
  {
    slug: "daily-tasks",
    title: "今日の作業を整理する",
    description: "今日やることを並べ、次の依頼に進む方法。",
    audience: "予定と依頼が混ざる副業者",
    pain: "何から手を付けるか毎回迷う",
    oldSteps: ["メモを見返す", "優先順位を考える", "後回しにする"],
    newSteps: ["今日の整理を開く", "次の1件を決める", "必要なら依頼する"],
    available: ["今日のタスク整理"],
    unavailable: ["Free での Googleカレンダー同期（Standard 以上）"],
    faq: [
      { q: "カレンダー連携は", a: "Googleカレンダーは Standard 以上です。無料診断ではタスク整理まで案内します。" },
    ],
    firstJob: "schedule",
    contentId: "ac_uc_daily",
    status: "draft",
  },
];

export function listUseCasePages(): UseCasePage[] {
  const approvals = getUseCaseStatusOverrides();
  return PAGES.map((page) => ({
    ...page,
    status: (approvals[page.slug] as UseCasePageStatus | undefined) ?? page.status,
  }));
}

export function getUseCasePage(slug: string): UseCasePage | null {
  return listUseCasePages().find((page) => page.slug === slug) ?? null;
}

export function setUseCaseStatus(
  slug: UseCaseSlug,
  status: UseCasePageStatus,
): UseCasePage | null {
  if (!PAGES.some((page) => page.slug === slug)) return null;
  setUseCaseStatusOverride(slug, status);
  return getUseCasePage(slug);
}

export function publicUseCasePages(): UseCasePage[] {
  return listUseCasePages().filter((page) => page.status === "approved");
}

export function publicUseCasePriceLine(): string {
  return prices();
}

export function publicUseCaseCampaignId(): string {
  return ACQUISITION_CAMPAIGN_ID;
}
