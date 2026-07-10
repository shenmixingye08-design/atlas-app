import type { MemoryCategory, LearningKey } from "./types";

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  writing: "文章",
  sns: "SNS",
  sales: "営業資料",
  email: "メール",
  blog: "ブログ",
  image: "画像",
  video: "動画",
  schedule: "スケジュール",
  google: "Google利用",
  automation: "自動化",
  other: "その他",
};

export const LEARNING_KEY_LABELS: Record<LearningKey, string> = {
  sentence_ending: "語尾",
  text_length: "文章量",
  honorific: "敬語",
  emoji: "絵文字",
  color: "色",
  font: "フォント",
  layout: "資料レイアウト",
  post_time: "投稿時間",
  post_day: "投稿曜日",
  blog_length: "ブログ文字数",
  email_reply_speed: "メール返信速度",
  preferred_ai_employee: "よく任せる担当",
  preferred_service: "よく使うサービス",
  bookkeeping: "家計簿",
  vehicle: "車両管理",
  recurring_work: "定期作業",
};

export function getMemoryCategoryLabel(category: MemoryCategory): string {
  return MEMORY_CATEGORY_LABELS[category] ?? category;
}

export function getLearningKeyLabel(key: LearningKey): string {
  return LEARNING_KEY_LABELS[key] ?? key;
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
