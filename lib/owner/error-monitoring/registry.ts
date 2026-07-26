import type { ErrorCategoryDefinition, ErrorCategoryId } from "./types";

export const ERROR_CATEGORY_DEFINITIONS: readonly ErrorCategoryDefinition[] = [
  {
    id: "google_auth",
    label: "Google認証失敗",
    description: "Google OAuth / アカウント連携の失敗",
  },
  {
    id: "dropbox_auth",
    label: "Dropbox認証失敗",
    description: "Dropbox OAuth / ファイル連携の失敗",
  },
  {
    id: "x_post",
    label: "X投稿失敗",
    description: "X（旧Twitter）への投稿・SNS自動投稿の失敗",
  },
  {
    id: "webhook",
    label: "Webhook失敗",
    description: "外部Webhook受信・処理の失敗",
  },
  {
    id: "openai",
    label: "OpenAI失敗",
    description: "OpenAI API呼び出しの失敗",
  },
  {
    id: "stripe",
    label: "Stripe失敗",
    description: "Stripe決済・請求APIの失敗",
  },
  {
    id: "vision",
    label: "Vision失敗",
    description: "画像認識・Vision APIの失敗",
  },
  {
    id: "pdf",
    label: "PDF失敗",
    description: "PDF生成・変換の失敗",
  },
  {
    id: "word",
    label: "Word失敗",
    description: "Word文書生成の失敗",
  },
  {
    id: "excel",
    label: "Excel失敗",
    description: "Excel生成の失敗",
  },
  {
    id: "wordpress",
    label: "WordPress失敗",
    description: "WordPress投稿・連携の失敗",
  },
  {
    id: "supabase",
    label: "Supabase失敗",
    description: "Supabase読み書き・接続の失敗",
  },
  {
    id: "auth",
    label: "認証失敗",
    description: "Clerk / 認証まわりの失敗",
  },
  {
    id: "image_generation",
    label: "画像生成失敗",
    description: "画像生成APIの失敗",
  },
  {
    id: "scheduler",
    label: "Scheduler失敗",
    description: "Cron / スケジューラ実行の失敗",
  },
  {
    id: "automation",
    label: "Automation失敗",
    description: "Automationジョブ実行の失敗",
  },
] as const;

export const ERROR_CATEGORY_IDS: readonly ErrorCategoryId[] =
  ERROR_CATEGORY_DEFINITIONS.map((definition) => definition.id);

export function getErrorCategoryDefinition(
  id: ErrorCategoryId,
): ErrorCategoryDefinition {
  const definition = ERROR_CATEGORY_DEFINITIONS.find((entry) => entry.id === id);
  if (!definition) {
    throw new Error(`Error category not found: ${id}`);
  }
  return definition;
}

export function isErrorCategoryId(value: string): value is ErrorCategoryId {
  return ERROR_CATEGORY_IDS.includes(value as ErrorCategoryId);
}
