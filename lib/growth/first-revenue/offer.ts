import { getPlanDefinition } from "@/lib/billing/plans/registry";

import { FIRST_OFFER_CONTENT_ID, FIRST_OFFER_PATH, FIRST_REVENUE_CAMPAIGN_ID } from "./constants";

export function firstOfferCopy() {
  const free = getPlanDefinition("free");
  const light = getPlanDefinition("light");
  return {
    slug: "first-offer",
    path: FIRST_OFFER_PATH,
    campaignId: FIRST_REVENUE_CAMPAIGN_ID,
    contentId: FIRST_OFFER_CONTENT_ID,
    product: "X投稿案の作成",
    headline: "毎日のX投稿文を、ゼロから考え続けなくてよい",
    audience: "副業・個人事業で X 発信を続けたい人",
    pain: "投稿テーマと文面を毎回思い出し、下書きのまま止まる",
    oldSteps: ["今日何を書くか考える", "文面を書く", "投稿するか迷って閉じる"],
    newSteps: [
      "無料登録する",
      "用意した例で投稿案を1件作る",
      "文面を確認し、X連携後に投稿を任せる",
    ],
    availableNow: [
      "X向け投稿文の作成（Freeでも1件依頼可）",
      "X連携後の自動投稿（月次上限あり）",
    ],
    unavailable: [
      "フォロワー増加の保証",
      "未連携アカウントへの自動投稿",
      "いいねやフォローの代行",
    ],
    freeScope: `${free.name}は月額${free.monthlyPriceJpy}円。AI利用 ${free.limits.aiUsageMonthly}回/月、X自動投稿 ${free.limits.xAutoPostsMonthly}件/月。投稿文の作成から試せます。`,
    paidScope: `${light.name}は月額${light.monthlyPriceJpy}円（税込）。AI利用 ${light.limits.aiUsageMonthly}回/月、X自動投稿 ${light.limits.xAutoPostsMonthly}件/月。毎日の投稿文を続けたい場合の既存プランです。`,
    recommendedPlanId: light.planId,
    recommendedPlanName: light.name,
    recommendedPriceJpy: light.monthlyPriceJpy,
    otherPlansHref: "/#pricing",
    screenHref: "/workspace/x",
    faq: [
      {
        q: "無料で試せますか",
        a: `Free で投稿文の作成を${free.limits.aiUsageMonthly}回依頼できます。自動投稿は X 連携のあとです。`,
      },
      {
        q: "登録したらすぐ投稿されますか",
        a: "されません。先に投稿案を確認します。自動投稿は連携と確認のあとです。",
      },
      {
        q: "PowerPointやカレンダーも含まれますか",
        a: "この導線では売りません。資料の完成スライド自動生成は未提供です。Googleカレンダーは Standard 以上です。",
      },
    ],
  };
}

export function offerSignupHref(): string {
  const copy = firstOfferCopy();
  const params = new URLSearchParams({
    redirect_url: "/projects?welcome=1&offer=sns",
    campaignId: copy.campaignId,
    contentId: copy.contentId,
    utm_source: "seo",
    utm_medium: "lp",
    utm_campaign: copy.campaignId,
    utm_content: copy.contentId,
  });
  return `/sign-up?${params.toString()}`;
}
