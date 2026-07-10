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
  title: "ATLAS X投稿",
  summary: "ATLASサービス告知用X投稿5件",
  posts: [
    "AIチームが24時間動く新しい働き方、ATLAS。依頼を入れるだけで企画から制作まで一気通貫。中小企業の業務効率化に。 #ATLAS #AI #業務効率化",
    "「メール1通書くだけ」で営業文・紹介文・SNS投稿まで。ATLASはAI組織をワンクリックで起動します。無料トライアル受付中。 #SaaS #マーケティング",
    "制作物の品質チェックもAI QAが担当。人が最終確認する前に、抜け漏れを自動検知。ATLASで安心の納品体験を。 #品質管理",
    "建設・不動産・士業まで。業界別テンプレートで初日から使える。ATLASが短時間でプロ品質の成果物を届けます。 #DX",
    "チーム全員が同じ品質基準で動く。CEO→Planner→Workerの役割分担で、属人化しない制作フローを実現。詳細はプロフィールから。 #ATLAS",
  ],
  content: "",
  markdown: "",
  html: "",
  plainText: "",
  tags: ["ATLAS", "X", "SNS"],
  audience: "X（Twitter）フォロワー",
  topic: "ATLASサービス紹介",
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
  title: "ATLASサービス紹介",
  summary: "ATLASの主要機能と導入メリットを300文字程度で紹介",
  content: `ATLASは、依頼を入力するだけでAI組織（CEO・Planner・Worker）が連携し、営業メール・SNS投稿・紹介文などの成果物を自動生成するワークスペースです。品質チェック機能付きで、誰でもプロ品質の制作物を短時間で得られます。中小企業のマーケ・営業・広報担当者に最適。`,
  markdown: "",
  html: "",
  plainText: "",
  tags: ["ATLAS", "紹介"],
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
    case "chat":
    default:
      return "Mock Atlas response (ATLAS_MOCK_LLM=true). No API call was made.";
  }
}

export function isMockLlmEnabled(): boolean {
  return process.env.ATLAS_MOCK_LLM === "true";
}
