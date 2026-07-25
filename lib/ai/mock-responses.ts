import type { AiTaskType } from "./model-policy";

function isCoreTestMode(): boolean {
  return process.env.ATLAS_CORE_TEST === "true";
}

const MOCK_BLOG_WORKER = {
  type: "blog",
  title: "AI時代のブログ運用ガイド",
  summary:
    "AIを活用したブログ制作の基本手順と、品質を保ちながら効率化するポイントを解説します。",
  content: `# AI時代のブログ運用ガイド

## はじめに

ブログは信頼構築と集客の基盤です。AIを補助として使うことで、企画から公開までのサイクルを短縮できます。

## 企画のポイント

- 読者の課題を1つに絞る
- 検索意図に沿った見出しを設計する
- 一次情報や具体例を必ず入れる

## 制作フロー

1. テーマとキーワードを決める
2. 見出し構成を作る
3. 本文を執筆し、事実関係を確認する
4. SEOメタ情報とSNS投稿文を用意する

## まとめ

AIは下書きの加速に有効ですが、最終判断は人間が行うことで品質と信頼を両立できます。`,
  markdown: `# AI時代のブログ運用ガイド

## はじめに

ブログは信頼構築と集客の基盤です。AIを補助として使うことで、企画から公開までのサイクルを短縮できます。

## 企画のポイント

- 読者の課題を1つに絞る
- 検索意図に沿った見出しを設計する
- 一次情報や具体例を必ず入れる

## 制作フロー

1. テーマとキーワードを決める
2. 見出し構成を作る
3. 本文を執筆し、事実関係を確認する
4. SEOメタ情報とSNS投稿文を用意する

## まとめ

AIは下書きの加速に有効ですが、最終判断は人間が行うことで品質と信頼を両立できます。`,
  html: "",
  plainText:
    "AI時代のブログ運用ガイド。AIを活用したブログ制作の基本手順と品質管理のポイント。",
  tags: ["ブログ", "AI", "マーケティング"],
  seo: {
    title: "AI時代のブログ運用ガイド",
    description: "AIを活用したブログ制作の基本手順と品質管理のポイントを解説。",
    keywords: ["ブログ", "AI", "SEO"],
  },
  snsPost: "新記事「AI時代のブログ運用ガイド」を公開しました。",
  topic: "ブログ運用",
  audience: "マーケ担当者",
};

const MOCK_PLANNER = {
  plan: "1. 読者課題の整理 2. 見出し構成 3. 本文執筆 4. SEO/SNS整備",
  deliverableType: "blog",
  tasks: [
    {
      title: "ブログ記事を執筆",
      description: "SEOを意識したブログ記事を構造化JSONで作成する",
    },
  ],
};

const MOCK_PROPOSAL_WORKER = {
  type: "proposal",
  title: "DX支援提案書",
  summary: "中小企業向けの業務効率化提案の概要です。",
  content: `# DX支援提案書

## 背景
業務の属人化と手作業がボトルネックになっています。

## 提案内容
- ワークフロー可視化
- 定型業務の自動化
- 社内ナレッジ基盤の整備

## 期待効果
工数削減と品質の安定化を見込みます。`,
  markdown: "",
  html: "",
  plainText: "",
  tags: ["提案"],
  seo: { title: "DX支援提案書", description: "業務効率化の提案", keywords: ["提案", "DX"] },
  topic: "DX",
  audience: "経営層",
};

MOCK_PROPOSAL_WORKER.markdown = MOCK_PROPOSAL_WORKER.content;
MOCK_PROPOSAL_WORKER.plainText = MOCK_PROPOSAL_WORKER.content;

const MOCK_EMAIL_WORKER = {
  type: "email",
  title: "フォローアップメール",
  summary: "商談後のフォローアップメールです。",
  content: `件名: 本日はありがとうございました

お世話になっております。
本日のお打ち合わせ内容を踏まえ、次のステップとして資料を共有いたします。
ご確認のうえ、ご都合の良い日時をお知らせください。`,
  markdown: "",
  html: "",
  plainText: "",
  tags: ["メール"],
  audience: "見込み顧客",
  topic: "フォローアップ",
};

MOCK_EMAIL_WORKER.markdown = MOCK_EMAIL_WORKER.content;
MOCK_EMAIL_WORKER.plainText = MOCK_EMAIL_WORKER.content;

const MOCK_SALES_EMAIL_WORKER = {
  type: "email",
  title: "営業メール",
  summary: "建設会社向けの太陽光発電営業メール",
  content: `件名：【ご提案】建設現場の電力コスト削減 — 太陽光発電ソリューション

株式会社〇〇建設
ご担当者様

お世話になっております。〇〇エナジー株式会社の営業部と申します。
貴社の建設現場における電力コスト削減について、太陽光発電システムの導入をご提案させていただきたくご連絡いたしました。

当社のソリューションは、現場仮設電源の効率化と長期的な電力費削減を両立します。導入実績200件以上、平均で年間15%のコスト削減を実現しています。設計から施工管理まで一貫してサポートいたします。

まずは30分程度のオンライン説明会はいかがでしょうか。来週以降、ご都合の良い日時を2〜3候補お知らせいただけますと幸いです。

何卒よろしくお願いいたします。`,
  markdown: `## 件名
【ご提案】建設現場の電力コスト削減 — 太陽光発電ソリューション

## 本文
株式会社〇〇建設
ご担当者様

お世話になっております。〇〇エナジー株式会社の営業部と申します。
貴社の建設現場における電力コスト削減について、太陽光発電システムの導入をご提案させていただきたくご連絡いたしました。

当社のソリューションは、現場仮設電源の効率化と長期的な電力費削減を両立します。導入実績200件以上、平均で年間15%のコスト削減を実現しています。設計から施工管理まで一貫してサポートいたします。

まずは30分程度のオンライン説明会はいかがでしょうか。来週以降、ご都合の良い日時を2〜3候補お知らせいただけますと幸いです。

何卒よろしくお願いいたします。`,
  html: "",
  plainText: "",
  metadata: {
    subject: "【ご提案】建設現場の電力コスト削減 — 太陽光発電ソリューション",
    audience: "建設会社",
    purpose: "太陽光発電の営業",
    cta: "お問い合わせ・商談設定",
  },
  downloads: [
    { format: "md", label: "Markdown", ready: true },
    { format: "docx", label: "Word", ready: true },
    { format: "pdf", label: "PDF", ready: true },
  ],
};

MOCK_SALES_EMAIL_WORKER.plainText = `件名：${MOCK_SALES_EMAIL_WORKER.metadata.subject}

${MOCK_SALES_EMAIL_WORKER.content.replace(/^件名：.+?\n\n/, "")}`;

const MOCK_SOCIAL_POSTS_WORKER = {
  type: "social_post",
  title: "MINERVOT X投稿",
  summary: "MINERVOTサービス告知用X投稿5件",
  posts: [
    "AIチームが24時間動く新しい働き方、MINERVOT。依頼を入れるだけで企画から制作まで一気通貫。中小企業の業務効率化に。 #MINERVOT #AI #業務効率化",
    "「メール1通書くだけ」で営業文・紹介文・SNS投稿まで。MINERVOTはAI組織をワンクリックで起動します。無料トライアル受付中。 #SaaS #マーケティング",
    "制作物の品質チェックもAI QAが担当。人が最終確認する前に、抜け漏れを自動検知。MINERVOTで安心の納品体験を。 #品質管理",
    "建設・不動産・士業まで。業界別テンプレートで初日から使える。MINERVOTが短時間でプロ品質の成果物を届けます。 #DX",
    "チーム全員が同じ品質基準で動く。CEO→Planner→Workerの役割分担で、属人化しない制作フローを実現。詳細はプロフィールから。 #MINERVOT",
  ],
  content: "",
  markdown: "",
  html: "",
  plainText: "",
  tags: ["MINERVOT", "X", "SNS"],
  audience: "X（Twitter）フォロワー",
  topic: "MINERVOTサービス紹介",
};

MOCK_SOCIAL_POSTS_WORKER.content = MOCK_SOCIAL_POSTS_WORKER.posts
  .map((post, index) => `投稿 ${index + 1}:\n${post}`)
  .join("\n\n");
MOCK_SOCIAL_POSTS_WORKER.markdown = MOCK_SOCIAL_POSTS_WORKER.posts
  .map((post, index) => `## 投稿 ${index + 1}\n\n${post}`)
  .join("\n\n");
MOCK_SOCIAL_POSTS_WORKER.plainText = MOCK_SOCIAL_POSTS_WORKER.content;

const MOCK_SHORT_DOCUMENT_WORKER = {
  type: "short_document",
  title: "MINERVOTサービス紹介",
  summary: "MINERVOTの主要機能と導入メリットを300文字程度で紹介",
  content: `MINERVOTは、依頼を入力するだけでAI組織（CEO・Planner・Worker）が連携し、営業メール・SNS投稿・紹介文などの成果物を自動生成するワークスペースです。品質チェック機能付きで、誰でもプロ品質の制作物を短時間で得られます。中小企業のマーケ・営業・広報担当者に最適。`,
  markdown: "",
  html: "",
  plainText: "",
  tags: ["MINERVOT", "紹介"],
  topic: "サービス紹介",
  audience: "見込み顧客",
};

MOCK_SHORT_DOCUMENT_WORKER.markdown = `# ${MOCK_SHORT_DOCUMENT_WORKER.title}\n\n${MOCK_SHORT_DOCUMENT_WORKER.content}`;
MOCK_SHORT_DOCUMENT_WORKER.plainText = MOCK_SHORT_DOCUMENT_WORKER.content;

const MOCK_SNS_WORKER = {
  type: "document",
  title: "太陽光発電SNS投稿",
  summary: "太陽光発電ソリューションの認知拡大向けSNS投稿文です。",
  content: `【建設現場の電力コスト、見直しませんか？】

太陽光発電の導入で、現場の電力費を平均15%削減した事例をご紹介します。
設計から施工までワンストップでサポート。

詳細はプロフィールリンクから ▶

#太陽光発電 #建設業 #コスト削減 #SDGs`,
  markdown: "",
  html: "",
  plainText: "",
  tags: ["SNS", "太陽光", "投稿"],
  audience: "建設・設備業界の担当者",
  topic: "SNS投稿",
};

MOCK_SNS_WORKER.markdown = MOCK_SNS_WORKER.content;
MOCK_SNS_WORKER.plainText = MOCK_SNS_WORKER.content;

function isSnsRequest(input: string): boolean {
  return /sns投稿|sns.*投稿|ツイート|twitter|x投稿|social\s*post|投稿文を|ソーシャル.*投稿|sns.*作成/i.test(
    input,
  );
}

function inferMockDeliverableType(
  input: string,
): "blog" | "proposal" | "email" | "social_post" | "short_document" | "document" {
  if (isCoreTestMode()) {
    if (/営業メール|sales\s*email|セールスメール|メール|email/.test(input.toLowerCase()) && !isSnsRequest(input)) {
      return "email";
    }
    if (isSnsRequest(input)) return "social_post";
    return "short_document";
  }

  const haystack = input.toLowerCase();
  if (/営業メール|sales\s*email|セールスメール|提案メール/.test(input)) return "email";
  if (/メール|email/.test(haystack) && !isSnsRequest(input)) return "email";
  if (/ブログ|blog|記事/.test(haystack) && !isSnsRequest(input)) return "blog";
  if (/提案|proposal/.test(haystack)) return "proposal";
  return "document";
}

function buildMockPlannerOutput(input: string) {
  const deliverableType = inferMockDeliverableType(input);

  if (deliverableType === "email") {
    return {
      plan: "1. 想定読者と目的の整理 2. 件名案 3. 本文起草（500文字程度）",
      deliverableType: "email",
      tasks: [
        {
          title: "営業メールを起草",
          description: "件名と本文を含む営業メールを構造化JSONで作成する",
        },
      ],
    };
  }

  if (isSnsRequest(input)) {
    return {
      plan: "1. ターゲット整理 2. フック文案 3. 投稿文作成",
      deliverableType: isCoreTestMode() ? "social_post" : "document",
      tasks: [
        {
          title: "SNS投稿文を作成",
          description: "3〜5件の投稿文を構造化JSONで作成する",
        },
      ],
    };
  }

  if (deliverableType === "proposal") {
    return {
      plan: "1. 背景整理 2. 提案内容 3. 期待効果",
      deliverableType: "proposal",
      tasks: [
        {
          title: "提案書を作成",
          description: "構造化JSONで提案書を作成する",
        },
      ],
    };
  }

  if (deliverableType === "blog") {
    return MOCK_PLANNER;
  }

  return {
    plan: "1. 要件整理 2. 本文作成",
    deliverableType: isCoreTestMode() ? "short_document" : "document",
    tasks: [
      {
        title: "短文ドキュメントを作成",
        description: "タイトルと本文を含む成果物を構造化JSONで作成する",
      },
    ],
  };
}

/** Deterministic mock LLM output — zero OpenAI calls when ATLAS_MOCK_LLM=true. */
export function resolveMockLlmOutput(
  aiTaskType: AiTaskType | undefined,
  input: string,
): string {
  switch (aiTaskType) {
    case "planner_unified":
      return JSON.stringify(buildMockPlannerOutput(input));
    case "worker_deliverable":
    case "worker_deliverable_light":
    case "worker_revision": {
      const type = inferMockDeliverableType(input);
      if (type === "proposal") return JSON.stringify(MOCK_PROPOSAL_WORKER);
      if (type === "email") {
        if (/営業|太陽光|建設|sales/i.test(input)) {
          return JSON.stringify(MOCK_SALES_EMAIL_WORKER);
        }
        return JSON.stringify(MOCK_EMAIL_WORKER);
      }
      if (type === "social_post" || isSnsRequest(input)) {
        return JSON.stringify(MOCK_SOCIAL_POSTS_WORKER);
      }
      if (type === "short_document") {
        return JSON.stringify(MOCK_SHORT_DOCUMENT_WORKER);
      }
      if (isSnsRequest(input)) return JSON.stringify(MOCK_SNS_WORKER);
      return JSON.stringify(MOCK_BLOG_WORKER);
    }
    case "research_synthesis":
      return JSON.stringify({
        executiveSummary: "Mock research summary for beta testing.",
        keyFindings: ["Market demand is growing", "Competitors invest in AI"],
        supportingEvidence: ["Industry report 2026"],
        risks: ["Regulatory change"],
        sources: ["https://example.com/report"],
        confidenceScore: 82,
      });
    case "reviewer_fallback":
      return "APPROVED\n\nMock reviewer fallback — deliverable meets minimum requirements.";
    case "vision_analyze": {
      const isReceipt = /レシート|家計簿|receipt/i.test(input);
      const isInvoice = /請求書|invoice/i.test(input);
      const isTable = /表|Excel|エクセル|table/i.test(input);
      const isMemo = /手書き|メモ|文字にして/i.test(input);
      const isCard = /名刺|連絡先|business\s*card/i.test(input);
      const isSales = /営業|資料|改善|チラシ|sales/i.test(input);

      if (isReceipt) {
        return JSON.stringify({
          detectedType: "receipt",
          confidence: 0.92,
          summary: "コンビニのレシート。合計1,280円。",
          extractedText: "MINERVOT MART\n2026/07/25\nお茶 150\n弁当 980\n合計 1,280\n現金",
          language: "ja",
          fields: {
            storeName: "MINERVOT MART",
            date: "2026-07-25",
            items: [
              { name: "お茶", amount: 150, category: "飲料" },
              { name: "弁当", amount: 980, category: "食料品" },
            ],
            subtotal: 1130,
            tax: 150,
            total: 1280,
            paymentMethod: "現金",
          },
          tables: [],
          visualElements: ["店名", "合計金額"],
          layout: { hierarchy: "単票", readability: "良好" },
          styleSignals: null,
          warnings: [],
          missingFields: [],
          recommendedActions: ["家計簿Excelを生成"],
          artifactSuggestions: ["household_excel"],
        });
      }

      if (isInvoice) {
        return JSON.stringify({
          detectedType: "invoice",
          confidence: 0.9,
          summary: "請求書。合計110,000円。",
          extractedText: "請求書\n株式会社サンプル\n請求番号 INV-001\n合計 110,000",
          language: "ja",
          fields: {
            issuer: "株式会社サンプル",
            recipient: "株式会社テスト",
            invoiceNumber: "INV-001",
            issueDate: "2026-07-01",
            dueDate: null,
            lineItems: [{ name: "コンサルティング", quantity: 1, unitPrice: 100000, amount: 100000 }],
            subtotal: 100000,
            tax: 10000,
            total: 110000,
            bankDetails: null,
          },
          tables: [],
          visualElements: ["社印"],
          layout: { hierarchy: "帳票", readability: "良好" },
          styleSignals: null,
          warnings: ["支払期限が読めません", "振込先が見切れています"],
          missingFields: ["dueDate", "bankDetails"],
          recommendedActions: ["不足項目を確認してExcel化"],
          artifactSuggestions: ["invoice_excel"],
        });
      }

      if (isTable) {
        return JSON.stringify({
          detectedType: "table",
          confidence: 0.88,
          summary: "3列の表スクリーンショット",
          extractedText: "品目 数量 金額\nA 2 1000\nB 1 500",
          language: "ja",
          fields: {},
          tables: [
            {
              headers: ["品目", "数量", "金額"],
              rows: [
                ["A", 2, 1000],
                ["B", 1, 500],
              ],
              notes: null,
            },
          ],
          visualElements: ["表"],
          layout: { hierarchy: "表", readability: "良好" },
          styleSignals: null,
          warnings: [],
          missingFields: [],
          recommendedActions: ["Excelを生成"],
          artifactSuggestions: ["table_excel"],
        });
      }

      if (isMemo) {
        return JSON.stringify({
          detectedType: "handwritten_note",
          confidence: 0.8,
          summary: "手書きの打合せメモ",
          extractedText: "明日10時 見積送付",
          language: "ja",
          fields: {
            rawText: "明日10時 見積送付",
            cleanedText: "明日の10時に見積を送付する。",
            summary: "見積送付の予定メモ",
          },
          tables: [],
          visualElements: ["手書き文字"],
          layout: null,
          styleSignals: null,
          warnings: ["一部が不鮮明"],
          missingFields: ["担当者名"],
          recommendedActions: ["原文・整形・要約を分けて提示"],
          artifactSuggestions: ["memo_text"],
        });
      }

      if (isCard) {
        return JSON.stringify({
          detectedType: "business_card",
          confidence: 0.91,
          summary: "名刺情報",
          extractedText: "山田太郎\n株式会社サンプル",
          language: "ja",
          fields: {
            personName: "山田太郎",
            companyName: "株式会社サンプル",
            department: "営業部",
            title: "主任",
            phone: "03-1234-5678",
            email: "taro@example.com",
            address: "東京都",
            website: "https://example.com",
          },
          tables: [],
          visualElements: ["ロゴ"],
          layout: null,
          styleSignals: null,
          warnings: [],
          missingFields: [],
          recommendedActions: ["連絡先として整理（保存は承認後）"],
          artifactSuggestions: ["contact_card"],
        });
      }

      if (isSales) {
        return JSON.stringify({
          detectedType: "sales_material",
          confidence: 0.86,
          summary: "太陽光の営業チラシ。CTAが弱い。",
          extractedText: "今ならお得\nお問い合わせください",
          language: "ja",
          fields: {
            title: "太陽光発電のご提案",
            targetAudience: "戸建て住宅オーナー",
            keyMessage: "電気代削減と安心施工",
            benefits: "初期費用の見える化、保証付き",
            callToAction: "お問い合わせください",
            contactInfo: null,
            weaknesses: ["CTAが弱い", "問い合わせ先がない", "対象読者が不明瞭"],
          },
          tables: [],
          visualElements: ["写真", "見出し"],
          layout: {
            hierarchy: "見出し→本文→CTA",
            readability: "文字量がやや多い",
            colorTendency: "青基調",
            logoPosition: "左上",
            ctaPlacement: "下部",
          },
          styleSignals: {
            tone: "丁寧",
            politeness: "ですます",
            sentenceLength: "やや長め",
            headingStyle: "短い名詞見出し",
            frequentPhrases: ["安心", "お得"],
            ctaStyle: "一般的なお問い合わせ誘導",
            structure: "課題→提案→CTA",
            designTendency: "写真多め",
            forbiddenCandidates: [],
          },
          warnings: ["問い合わせ先がない"],
          missingFields: ["contactInfo"],
          recommendedActions: ["改善版資料を生成", "CTAと連絡先を強化"],
          artifactSuggestions: ["improved_sales_doc"],
        });
      }

      return JSON.stringify({
        detectedType: "general_photo",
        confidence: 0.6,
        summary: "一般写真として解析しました",
        extractedText: null,
        language: "ja",
        fields: {},
        tables: [],
        visualElements: [],
        layout: null,
        styleSignals: null,
        warnings: [],
        missingFields: [],
        recommendedActions: ["用途を指定してください"],
        artifactSuggestions: [],
      });
    }
    case "chat":
    default:
      return "Mock Atlas response (ATLAS_MOCK_LLM=true). No API call was made.";
  }
}

import { isAtlasProduction } from "@/lib/runtime/is-production";

export function isMockLlmEnabled(): boolean {
  if (isAtlasProduction()) return false;
  return process.env.ATLAS_MOCK_LLM === "true";
}
