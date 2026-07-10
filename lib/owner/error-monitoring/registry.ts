import type { ErrorCategoryDefinition, ErrorCategoryId } from "./types";

export const ERROR_CATEGORY_DEFINITIONS: readonly ErrorCategoryDefinition[] = [
  {
    id: "google_auth",
    label: "Google認証失敗",
    description: "Google OAuth / アカウント連携の失敗",
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
