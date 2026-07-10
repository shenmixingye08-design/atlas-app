/**
 * 特定商取引法に基づく表記 — structured content for /legal.
 * Operator details are loaded from lib/config/site.ts for easy updates.
 */

import { formatPlanPriceJpy } from "@/lib/billing/client";
import { listPlanDefinitions } from "@/lib/billing/plans/registry";
import { siteConfig } from "@/lib/config/site";

import type { LegalArticle, LegalDocumentMeta } from "./types";

export const LEGAL_META: LegalDocumentMeta = {
  version: "1.0.0",
  lastUpdated: "2026-07-06",
  lastUpdatedDisplay: "2026年7月6日",
  effectiveDateDisplay: "2026年7月6日",
};

function buildPlanPriceBlocks(): LegalArticle["blocks"] {
  const plans = listPlanDefinitions();

  return [
    {
      type: "paragraph",
      text: "各プランの料金は以下のとおりです（税込）。最新の内容は料金ページでもご確認いただけます。",
    },
    {
      type: "bullets",
      items: plans.map(
        (plan) =>
          `${plan.name}（${plan.planId}）— ${formatPlanPriceJpy(plan.monthlyPriceJpy)}${plan.monthlyPriceJpy > 0 ? " / 月" : ""}`,
      ),
    },
    {
      type: "link",
      label: "料金・プラン一覧を見る",
      href: siteConfig.pricingPagePath,
      description: "ランディングページの料金セクションへ移動します。",
    },
    {
      type: "link",
      label: "プラン・請求（ログイン後）",
      href: siteConfig.billingSettingsPath,
      description: "ログイン後、プラン変更・請求管理ができます。",
    },
  ];
}

function buildPaymentMethodBlocks(): LegalArticle["blocks"] {
  const { paymentMethods } = siteConfig;

  const blocks: LegalArticle["blocks"] = [
    {
      type: "paragraph",
      text: "有料プランのお支払いは、以下の方法で承ります。",
    },
  ];

  for (const method of paymentMethods) {
    blocks.push({ type: "subheading", text: method.label });
    blocks.push({ type: "bullets", items: [...method.methods] });
  }

  blocks.push({
    type: "paragraph",
    text: "決済処理は Stripe, Inc. の決済インフラを利用します。カード情報は当社サーバーには保存されません。",
  });

  return blocks;
}

const operator = siteConfig.operator;

export const LEGAL_ITEMS: LegalArticle[] = [
  {
    id: "legal-1",
    number: 1,
    sectionPrefix: "①",
    title: "販売事業者",
    blocks: [{ type: "paragraph", text: operator.businessName }],
  },
  {
    id: "legal-2",
    number: 2,
    sectionPrefix: "②",
    title: "運営責任者",
    blocks: [{ type: "paragraph", text: operator.representativeName }],
  },
  {
    id: "legal-3",
    number: 3,
    sectionPrefix: "③",
    title: "所在地",
    blocks: [{ type: "paragraph", text: operator.address }],
  },
  {
    id: "legal-4",
    number: 4,
    sectionPrefix: "④",
    title: "お問い合わせ",
    blocks: [
      { type: "subheading", text: "メールアドレス" },
      {
        type: "link",
        label: operator.contactEmail,
        href: `mailto:${operator.contactEmail}`,
        description: "プライバシー・請求・サービス全般のお問い合わせ",
      },
      {
        type: "link",
        label: "お問い合わせページ",
        href: operator.contactPath,
        description: "フォームからのお問い合わせはこちら",
      },
    ],
  },
  {
    id: "legal-5",
    number: 5,
    sectionPrefix: "⑤",
    title: "販売価格",
    blocks: buildPlanPriceBlocks(),
  },
  {
    id: "legal-6",
    number: 6,
    sectionPrefix: "⑥",
    title: "商品代金以外の必要料金",
    blocks: [
      {
        type: "paragraph",
        text: "インターネット接続に必要な通信料、プロバイダ料金等はお客様のご負担となります。",
      },
      {
        type: "paragraph",
        text: "その他、当社が別途明示した手数料がある場合を除き、商品代金以外の必須費用はありません。",
      },
    ],
  },
  {
    id: "legal-7",
    number: 7,
    sectionPrefix: "⑦",
    title: "支払方法",
    blocks: buildPaymentMethodBlocks(),
  },
  {
    id: "legal-8",
    number: 8,
    sectionPrefix: "⑧",
    title: "支払時期",
    blocks: [
      {
        type: "bullets",
        items: [
          "有料プランの初回お支払い：サブスクリプション開始時（申込完了時）",
          "継続課金：各契約期間の更新日に自動決済",
        ],
      },
    ],
  },
  {
    id: "legal-9",
    number: 9,
    sectionPrefix: "⑨",
    title: "サービス提供時期",
    blocks: [
      {
        type: "paragraph",
        text: "決済完了後、直ちに有料プランの機能をご利用いただけます。無料プランはアカウント作成後すぐに利用可能です。",
      },
    ],
  },
  {
    id: "legal-10",
    number: 10,
    sectionPrefix: "⑩",
    title: "解約方法",
    blocks: [
      {
        type: "paragraph",
        text: "有料プランは、設定画面の「プラン・請求」から Stripe カスタマーポータルにアクセスし、いつでも解約（次回更新の停止）できます。",
      },
      {
        type: "link",
        label: "プラン・請求（/settings/billing）",
        href: siteConfig.billingSettingsPath,
        description: "ログイン後に解約手続きを行えます。",
      },
      {
        type: "paragraph",
        text: "解約後も、既にお支払い済みの契約期間終了までは、プランに応じた機能を利用できる場合があります。",
      },
    ],
  },
  {
    id: "legal-11",
    number: 11,
    sectionPrefix: "⑪",
    title: "返金",
    blocks: [
      {
        type: "paragraph",
        text: "デジタルサービスの性質上、原則として返金は行いません。月の途中で解約された場合でも、日割り計算による返金はいたしません。",
      },
      {
        type: "paragraph",
        text: "ただし、法令上返金が必要な場合、当社の明らかな過失によりサービスが提供できなかった場合等は、この限りではありません。返金に関するお問い合わせは、④の連絡先までご連絡ください。",
      },
    ],
  },
];
