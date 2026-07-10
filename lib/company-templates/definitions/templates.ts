import { presetToCron } from "@/lib/automations/schedule";
import type { CompanyTemplate } from "../types";

const TZ = "Asia/Tokyo";

function dailyAutomation(
  id: string,
  name: string,
  description: string,
  hour: number,
  assignment: string,
): CompanyTemplate["automationPresets"][number] {
  const preset = { type: "daily" as const, hour, minute: 0 };
  return {
    id,
    name,
    description,
    schedule: {
      kind: "schedule",
      preset,
      cron: presetToCron(preset),
      timezone: TZ,
      label: `毎日 ${hour}:00`,
    },
    workflow: { assignment },
    enabled: true,
  };
}

function weeklyAutomation(
  id: string,
  name: string,
  description: string,
  dayOfWeek: number,
  hour: number,
  label: string,
  assignment: string,
): CompanyTemplate["automationPresets"][number] {
  const preset = { type: "weekly" as const, dayOfWeek, hour, minute: 0 };
  return {
    id,
    name,
    description,
    schedule: {
      kind: "schedule",
      preset,
      cron: presetToCron(preset),
      timezone: TZ,
      label,
    },
    workflow: { assignment },
    enabled: true,
  };
}

export const bloggingCompanyTemplate: CompanyTemplate = {
  id: "blogging",
  name: "ブログ運営",
  description:
    "SEO記事、編集カレンダー、トピックリサーチに特化したコンテンツ制作会社。",
  icon: "✍️",
  brandColor: "#059669",
  enabledDepartments: ["marketing", "research", "design", "development"],
  defaultWorkflows: [
    {
      id: "seo-article",
      name: "SEO記事ドラフト",
      description: "キーワード調査付きの長文記事",
      sampleAssignment:
        "ターゲットキーワード「{keyword}」向けのSEOブログ記事ドラフトを作成してください。見出し構成、本文、メタディスクリプションを含めてください。",
    },
    {
      id: "content-calendar",
      name: "コンテンツカレンダー",
      description: "4週間分の投稿計画",
      sampleAssignment:
        "今月のブログコンテンツカレンダーを4週間分作成してください。テーマ、キーワード、CTA、担当部門を表形式で整理してください。",
    },
  ],
  deliverables: {
    defaultFormats: ["md", "docx"],
    keywordRules: [
      {
        id: "blog-post",
        keywords: ["ブログ", "blog", "記事", "seo", "コラム"],
        formats: ["md", "docx"],
      },
    ],
  },
  automationPresets: [
    dailyAutomation(
      "tpl-blog-daily-draft",
      "SEO記事ドラフト",
      "毎日、SEO向け記事ドラフトを自動生成",
      10,
      "本日のSEO記事ドラフトを1本作成してください。Researchでトレンドキーワードを調査し、見出し・本文・メタディスクリプションをMarkdown形式で納品してください。",
    ),
    weeklyAutomation(
      "tpl-blog-weekly-calendar",
      "週次コンテンツ計画",
      "毎週月曜に来週の投稿計画を作成",
      1,
      9,
      "毎週月曜 9:00",
      "来週のブログ投稿計画を作成してください。5本の記事テーマ、キーワード、公開優先度、担当部門を含むカレンダーにまとめてください。",
    ),
  ],
  memoryPreferences: {
    retainResearchReports: true,
    retainQualityReviews: true,
    conversationHistoryDays: 90,
    preferredLanguage: "ja",
    tags: ["blogging", "content"],
  },
  researchBehavior: {
    defaultRequired: true,
    priorityCategories: [
      "web_research",
      "market_research",
      "statistics",
    ],
    triggerKeywords: ["seo", "キーワード", "トレンド", "競合記事"],
    guidance:
      "ブログ運営では企画前にキーワードと競合調査が必要です。web_research と statistics を優先してください。",
  },
  qualityCriteria: {
    passThreshold: 92,
    emphasis: {
      readability: "high",
      completeness: "high",
      visualStructure: "medium",
    },
  },
  routingKeywords: {
    marketing: ["seo", "blog", "記事", "コンテンツ"],
    research: ["キーワード", "調査", "トレンド"],
  },
};

export const affiliateCompanyTemplate: CompanyTemplate = {
  id: "affiliate",
  name: "アフィリエイト運営",
  description:
    "比較レビュー、ランディングページ、コンバージョン分析に特化したアフィリエイト運営会社。",
  icon: "🔗",
  brandColor: "#D97706",
  enabledDepartments: ["marketing", "research", "sales", "design", "finance"],
  defaultWorkflows: [
    {
      id: "comparison-review",
      name: "比較レビュー記事",
      description: "アフィリエイト向け比較コンテンツ",
      sampleAssignment:
        "「{product category}」の比較レビュー記事を作成してください。Researchで競合製品を調査し、比較表、Pros/Cons、おすすめ順位を含めてください。",
    },
  ],
  deliverables: {
    defaultFormats: ["md", "docx", "pdf"],
    keywordRules: [
      {
        id: "landing-page",
        keywords: ["lp", "ランディング", "landing page"],
        formats: ["md", "docx"],
      },
      {
        id: "comparison",
        keywords: ["比較", "レビュー", "review", "affiliate"],
        formats: ["md", "docx", "pdf"],
      },
    ],
  },
  automationPresets: [
    dailyAutomation(
      "tpl-affiliate-daily-keywords",
      "キーワード機会レポート",
      "毎朝、高CVキーワード候補を調査",
      8,
      "アフィリエイト向けの高CVキーワード候補を10件調査し、競合難易度、推定CPC、記事角度、優先度をまとめたレポートを作成してください。",
    ),
  ],
  memoryPreferences: {
    retainResearchReports: true,
    retainQualityReviews: true,
    conversationHistoryDays: 60,
    preferredLanguage: "ja",
    tags: ["affiliate", "monetization"],
  },
  researchBehavior: {
    defaultRequired: true,
    priorityCategories: [
      "competitor_research",
      "market_research",
      "statistics",
      "web_research",
    ],
    triggerKeywords: ["cv", "コンバージョン", "アフィリエイト", "比較"],
    guidance:
      "アフィリエイトでは競合価格、CVベンチマーク、市場ポジションの根拠が必要です。",
  },
  qualityCriteria: {
    passThreshold: 93,
    emphasis: {
      accuracy: "high",
      logic: "high",
      professionalism: "high",
    },
  },
  routingKeywords: {
    marketing: ["affiliate", "cv", "lp", "比較"],
    research: ["競合", "キーワード", "調査"],
    finance: ["収益", "roi", "コスト"],
  },
};

export const youtubeCompanyTemplate: CompanyTemplate = {
  id: "youtube",
  name: "YouTube制作",
  description:
    "動画企画、脚本、サムネイルブリーフ、チャンネル分析に特化したYouTube運営会社。",
  icon: "▶️",
  brandColor: "#DC2626",
  enabledDepartments: ["marketing", "research", "design", "development"],
  defaultWorkflows: [
    {
      id: "video-script",
      name: "動画脚本",
      description: "10分動画向けの脚本と構成",
      sampleAssignment:
        "「{topic}」について10分のYouTube動画脚本を作成してください。フック、章立て、CTA、サムネイル案を含めてください。",
    },
  ],
  deliverables: {
    defaultFormats: ["md", "docx", "pdf"],
    keywordRules: [
      {
        id: "video-script",
        keywords: ["youtube", "動画", "脚本", "script", "サムネ"],
        formats: ["md", "docx"],
      },
    ],
  },
  automationPresets: [
    weeklyAutomation(
      "tpl-youtube-weekly-ideas",
      "動画企画リスト",
      "毎週月曜に今週の動画企画10本を提案",
      1,
      10,
      "毎週月曜 10:00",
      "今週公開すべきYouTube動画企画を10本提案してください。タイトル案、フック、ターゲット視聴者、想定CTR、Research根拠を含めてください。",
    ),
  ],
  memoryPreferences: {
    retainResearchReports: true,
    retainQualityReviews: false,
    conversationHistoryDays: 45,
    preferredLanguage: "ja",
    tags: ["youtube", "video"],
  },
  researchBehavior: {
    defaultRequired: true,
    priorityCategories: ["web_research", "market_research", "statistics"],
    triggerKeywords: ["youtube", "視聴者", "トレンド", "ctr"],
    guidance:
      "YouTube制作ではトレンドと視聴者調査が必要です。web_research と statistics を優先してください。",
  },
  qualityCriteria: {
    passThreshold: 90,
    emphasis: {
      readability: "high",
      visualStructure: "high",
      logic: "medium",
    },
  },
  routingKeywords: {
    marketing: ["youtube", "動画", "チャンネル"],
    design: ["サムネ", "thumbnail", "ビジュアル"],
  },
};

export const salesCompanyTemplate: CompanyTemplate = {
  id: "sales",
  name: "営業支援",
  description:
    "営業資料、提案書、パイプライン分析、週次レポートに特化したセールス組織。",
  icon: "📈",
  brandColor: "#2563EB",
  enabledDepartments: ["sales", "research", "marketing", "finance", "legal"],
  defaultWorkflows: [
    {
      id: "sales-deck",
      name: "営業資料",
      description: "提案向けスライド構成",
      sampleAssignment:
        "「{client/industry}」向けの営業提案資料のアウトラインを作成してください。課題、解決策、ROI、導入ステップ、事例を含むPPTX向け構成にしてください。",
    },
  ],
  deliverables: {
    defaultFormats: ["pptx", "pdf", "docx"],
    keywordRules: [
      {
        id: "sales-deck",
        keywords: ["営業資料", "提案", "pitch", "sales deck"],
        formats: ["pptx", "pdf"],
      },
    ],
  },
  automationPresets: [
    weeklyAutomation(
      "tpl-sales-weekly-report",
      "週次セールスレポート",
      "毎週月曜にパイプライン概況を報告",
      1,
      9,
      "毎週月曜 9:00",
      "週次セールスレポートを作成してください。パイプライン概況、受注見込み、リスク、来週の優先アクションをSales部門視点でまとめてください。",
    ),
  ],
  memoryPreferences: {
    retainResearchReports: true,
    retainQualityReviews: true,
    conversationHistoryDays: 120,
    preferredLanguage: "ja",
    tags: ["sales", "pipeline"],
  },
  researchBehavior: {
    defaultRequired: true,
    priorityCategories: [
      "market_research",
      "competitor_research",
      "statistics",
    ],
    triggerKeywords: ["pipeline", "受注", "競合", "市場"],
    guidance:
      "営業支援では提案前に市場規模、競合ポジション、パイプラインの根拠が必要です。",
  },
  qualityCriteria: {
    passThreshold: 95,
    emphasis: {
      professionalism: "high",
      accuracy: "high",
      logic: "high",
    },
  },
  routingKeywords: {
    sales: ["営業", "提案", "pipeline", "受注"],
    finance: ["roi", "見積", "収益"],
  },
};

export const realEstateCompanyTemplate: CompanyTemplate = {
  id: "real-estate",
  name: "不動産支援",
  description:
    "物件資料、エリア分析、投資レポート、契約書ドラフトに特化した不動産会社。",
  icon: "🏠",
  brandColor: "#7C3AED",
  enabledDepartments: ["sales", "research", "legal", "finance", "marketing"],
  defaultWorkflows: [
    {
      id: "property-brief",
      name: "物件概要資料",
      description: "物件の販売用概要資料",
      sampleAssignment:
        "「{property/area}」の物件概要資料を作成してください。エリア分析、価格相場、ターゲット買主、訴求ポイント、リスクを含めてください。",
    },
  ],
  deliverables: {
    defaultFormats: ["pdf", "docx", "pptx"],
    keywordRules: [
      {
        id: "property-report",
        keywords: ["物件", "不動産", "real estate", "エリア分析"],
        formats: ["pdf", "docx"],
      },
      {
        id: "contract",
        keywords: ["契約", "contract", "重要事項"],
        formats: ["docx", "pdf"],
      },
    ],
  },
  automationPresets: [
    weeklyAutomation(
      "tpl-realestate-area-report",
      "エリア市場レポート",
      "毎週金曜に注目エリアの相場分析",
      5,
      16,
      "毎週金曜 16:00",
      "今週の注目エリア不動産市場レポートを作成してください。平均価格推移、需給、投資利回り、リスク、来週の注目物件タイプを含めてください。",
    ),
  ],
  memoryPreferences: {
    retainResearchReports: true,
    retainQualityReviews: true,
    conversationHistoryDays: 180,
    preferredLanguage: "ja",
    tags: ["real-estate", "property"],
  },
  researchBehavior: {
    defaultRequired: true,
    priorityCategories: [
      "market_research",
      "statistics",
      "legal_references",
      "web_research",
    ],
    triggerKeywords: ["相場", "利回り", "エリア", "規制"],
    guidance:
      "不動産支援では相場データ、エリア統計、法規制の参照が必要です。",
  },
  qualityCriteria: {
    passThreshold: 96,
    emphasis: {
      accuracy: "high",
      completeness: "high",
      professionalism: "high",
    },
  },
  routingKeywords: {
    legal: ["契約", "規制", "重要事項"],
    research: ["相場", "エリア", "調査"],
    finance: ["利回り", "投資", "収益"],
  },
};

export const ecommerceCompanyTemplate: CompanyTemplate = {
  id: "ecommerce",
  name: "EC運営",
  description:
    "商品説明、キャンペーン、在庫分析、CVR改善に特化したEC運営会社。",
  icon: "🛒",
  brandColor: "#DB2777",
  enabledDepartments: [
    "marketing",
    "sales",
    "design",
    "research",
    "finance",
    "customer-success",
  ],
  defaultWorkflows: [
    {
      id: "product-description",
      name: "商品説明文案",
      description: "EC商品ページ向けコピー",
      sampleAssignment:
        "「{product}」のEC商品ページ文案を作成してください。ベネフィット、スペック比較、FAQ、CTA、SEOメタ情報を含めてください。",
    },
  ],
  deliverables: {
    defaultFormats: ["md", "docx", "pdf"],
    keywordRules: [
      {
        id: "product-copy",
        keywords: ["商品", "product", "ec", "カート", "cvr"],
        formats: ["md", "docx"],
      },
    ],
  },
  automationPresets: [
    dailyAutomation(
      "tpl-ecom-daily-campaign",
      "日次キャンペーン案",
      "毎日、CVR改善キャンペーン案を提案",
      11,
      "本日実施すべきECキャンペーン案を3つ提案してください。対象商品、訴求、期待CVR改善、必要アセット、Research根拠を含めてください。",
    ),
  ],
  memoryPreferences: {
    retainResearchReports: true,
    retainQualityReviews: true,
    conversationHistoryDays: 60,
    preferredLanguage: "ja",
    tags: ["ecommerce", "retail"],
  },
  researchBehavior: {
    defaultRequired: true,
    priorityCategories: [
      "market_research",
      "competitor_research",
      "statistics",
      "web_research",
    ],
    triggerKeywords: ["cvr", "cv", "競合", "在庫", "カート"],
    guidance:
      "EC運営では競合価格、CVベンチマーク、商品トレンド調査が必要です。",
  },
  qualityCriteria: {
    passThreshold: 93,
    emphasis: {
      readability: "high",
      accuracy: "high",
      visualStructure: "medium",
    },
  },
  routingKeywords: {
    marketing: ["ec", "cvr", "キャンペーン", "商品"],
    "customer-success": ["レビュー", "サポート", "返品"],
  },
};

export const saasCompanyTemplate: CompanyTemplate = {
  id: "saas",
  name: "SaaS運営",
  description:
    "プロダクト仕様、リリースノート、技術ドキュメント、GTM資料に特化したSaaS会社。",
  icon: "☁️",
  brandColor: "#0891B2",
  enabledDepartments: [
    "development",
    "marketing",
    "sales",
    "research",
    "design",
    "customer-success",
  ],
  defaultWorkflows: [
    {
      id: "release-notes",
      name: "リリースノート",
      description: "今回リリースの変更点まとめ",
      sampleAssignment:
        "今回のSaaSリリースノートを作成してください。新機能、改善、バグ修正、既知の問題、ユーザー向けアップグレード手順を含めてください。",
    },
  ],
  deliverables: {
    defaultFormats: ["md", "pdf", "docx"],
    keywordRules: [
      {
        id: "readme",
        keywords: ["readme", "documentation", "仕様", "api"],
        formats: ["md", "txt", "pdf"],
      },
      {
        id: "release-notes",
        keywords: ["リリース", "release notes", "changelog"],
        formats: ["md", "docx"],
      },
    ],
  },
  automationPresets: [
    weeklyAutomation(
      "tpl-saas-weekly-changelog",
      "週次チェンジログ",
      "毎週金曜にリリース候補の変更サマリー",
      5,
      17,
      "毎週金曜 17:00",
      "今週のSaaSプロダクト変更サマリー（チェンジログ草案）を作成してください。新機能、改善、技術的負債、顧客影響、公開優先度を含めてください。",
    ),
  ],
  memoryPreferences: {
    retainResearchReports: true,
    retainQualityReviews: true,
    conversationHistoryDays: 90,
    preferredLanguage: "ja",
    tags: ["saas", "product"],
  },
  researchBehavior: {
    defaultRequired: false,
    priorityCategories: [
      "technical_documentation",
      "competitor_research",
      "market_research",
    ],
    triggerKeywords: ["api", "競合", "市場", "技術"],
    guidance:
      "SaaS運営では社内仕様が中心ですが、競合・API・市場の言及がある場合は調査を必須にしてください。",
  },
  qualityCriteria: {
    passThreshold: 94,
    emphasis: {
      accuracy: "high",
      logic: "high",
      completeness: "high",
    },
  },
  routingKeywords: {
    development: ["api", "実装", "仕様", "バグ"],
    "customer-success": ["オンボーディング", "サポート", "churn"],
  },
};

export const marketingAgencyTemplate: CompanyTemplate = {
  id: "marketing-agency",
  name: "マーケティング支援",
  description:
    "クライアント向けキャンペーン、ブランド戦略、レポート、提案資料を扱う総合マーケ代理店。",
  icon: "🎯",
  brandColor: "#4F46E5",
  enabledDepartments: [
    "marketing",
    "design",
    "research",
    "sales",
    "development",
    "finance",
  ],
  defaultWorkflows: [
    {
      id: "campaign-brief",
      name: "キャンペーンブリーフ",
      description: "クライアント向けキャンペーン企画書",
      sampleAssignment:
        "「{client/campaign}」のキャンペーンブリーフを作成してください。目的、KPI、ターゲット、チャネル戦略、クリエイティブ方向性、予算案を含めてください。",
    },
  ],
  deliverables: {
    defaultFormats: ["pptx", "pdf", "docx"],
    keywordRules: [
      {
        id: "campaign-deck",
        keywords: ["キャンペーン", "campaign", "提案", "brief"],
        formats: ["pptx", "pdf"],
      },
      {
        id: "report",
        keywords: ["レポート", "report", "kpi"],
        formats: ["pdf", "docx"],
      },
    ],
  },
  automationPresets: [
    dailyAutomation(
      "tpl-agency-daily-news",
      "業界ニュースサマリー",
      "毎朝、クライアント向け業界ニュースを要約",
      8,
      "クライアント向けの本日の業界ニュースサマリーを作成してください。主要トピック3–5件、影響分析、キャンペーンへの示唆を含めてください。",
    ),
    weeklyAutomation(
      "tpl-agency-weekly-kpi",
      "週次KPIレポート",
      "毎週月曜にキャンペーンKPIを報告",
      1,
      9,
      "毎週月曜 9:00",
      "主要クライアントキャンペーンの週次KPIレポートを作成してください。Reach、CTR、CVR、CPA、改善提案を含めてください。",
    ),
  ],
  memoryPreferences: {
    retainResearchReports: true,
    retainQualityReviews: true,
    conversationHistoryDays: 90,
    preferredLanguage: "ja",
    tags: ["agency", "marketing"],
  },
  researchBehavior: {
    defaultRequired: true,
    priorityCategories: [
      "market_research",
      "competitor_research",
      "web_research",
      "statistics",
    ],
    triggerKeywords: ["kpi", "キャンペーン", "競合", "市場"],
    guidance:
      "マーケティング支援では市場・競合調査がクライアント向け成果物の信頼性に不可欠です。",
  },
  qualityCriteria: {
    passThreshold: 95,
    emphasis: {
      professionalism: "high",
      visualStructure: "high",
      completeness: "high",
    },
  },
  routingKeywords: {
    marketing: ["campaign", "キャンペーン", "kpi", "ブランド"],
    design: ["クリエイティブ", "ビジュアル", "brand"],
  },
};

export const allCompanyTemplates: readonly CompanyTemplate[] = [
  bloggingCompanyTemplate,
  affiliateCompanyTemplate,
  youtubeCompanyTemplate,
  salesCompanyTemplate,
  realEstateCompanyTemplate,
  ecommerceCompanyTemplate,
  saasCompanyTemplate,
  marketingAgencyTemplate,
];
