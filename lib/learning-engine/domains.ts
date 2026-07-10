import type { LearningDomain } from "./types";

const DOMAIN_PATTERNS: Array<{ domain: LearningDomain; pattern: RegExp }> = [
  { domain: "sales_material", pattern: /営業|資料|sales|ppt|pdf|提案/i },
  { domain: "bookkeeping", pattern: /家計|簿記|経費|レシート|支出/i },
  { domain: "social_post", pattern: /sns|投稿|x\b|twitter|instagram|facebook/i },
  { domain: "image_production", pattern: /画像|image|バナー|サムネ/i },
  { domain: "video_production", pattern: /動画|video|youtube|ショート/i },
  { domain: "vehicle_management", pattern: /車|車両|メンテ|給油|オイル/i },
  { domain: "recurring_task", pattern: /毎日|毎週|毎月|定期|習慣|ルーティン/i },
  { domain: "document_creation", pattern: /資料|文書|ドキュメント|レポート|blog|ブログ|メール|mail/i },
];

const DELIVERABLE_DOMAIN_MAP: Record<string, LearningDomain> = {
  sales_material: "sales_material",
  blog: "document_creation",
  email: "document_creation",
  sns_post: "social_post",
  video: "video_production",
  image: "image_production",
};

export const LEARNING_DOMAIN_LABELS: Record<LearningDomain, string> = {
  document_creation: "資料作成",
  sales_material: "営業資料",
  bookkeeping: "家計簿",
  social_post: "投稿",
  image_production: "画像制作",
  video_production: "動画制作",
  vehicle_management: "車両管理",
  recurring_task: "定期業務",
  general_work: "その他の仕事",
};

export function inferLearningDomain(input: {
  assignment: string;
  deliverableType?: string | null;
}): LearningDomain {
  const deliverable = (input.deliverableType ?? "").toLowerCase();
  if (deliverable && DELIVERABLE_DOMAIN_MAP[deliverable]) {
    return DELIVERABLE_DOMAIN_MAP[deliverable]!;
  }

  const text = input.assignment.trim();
  for (const { domain, pattern } of DOMAIN_PATTERNS) {
    if (pattern.test(text)) return domain;
  }

  return "general_work";
}

export function getLearningDomainLabel(domain: LearningDomain): string {
  return LEARNING_DOMAIN_LABELS[domain] ?? domain;
}

export function isKnownLearningDomain(value: string): value is LearningDomain {
  return value in LEARNING_DOMAIN_LABELS;
}
