import type { EnvServiceId, OwnerEnvVarDefinition } from "./types";

export const ENV_SERVICE_LABELS: Record<EnvServiceId, string> = {
  openai: "OpenAI",
  clerk: "Clerk",
  stripe: "Stripe",
  supabase: "Supabase",
  google: "Google",
  dropbox: "Dropbox",
  line: "LINE",
  vercel_cron: "Vercel Cron",
  atlas: "ATLAS",
};

/**
 * Production-relevant env checklist (names only — never values).
 * Aligned with `.env.local.example` Phase1 required/recommended blocks.
 */
export const OWNER_ENV_VAR_DEFINITIONS: readonly OwnerEnvVarDefinition[] = [
  {
    key: "OPENAI_API_KEY",
    service: "openai",
    requirement: "required",
    purpose: "AI 実行（オーケストレーション / Responses）",
  },
  {
    key: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    service: "clerk",
    requirement: "required",
    purpose: "Clerk 公開キー（クライアント認証）",
  },
  {
    key: "CLERK_SECRET_KEY",
    service: "clerk",
    requirement: "required",
    purpose: "Clerk サーバー秘密鍵・OAuth state 署名フォールバック",
  },
  {
    key: "CLERK_WEBHOOK_SECRET",
    service: "clerk",
    requirement: "recommended",
    purpose: "Clerk Webhook（ログイン/ログアウト監査ログ）",
  },
  {
    key: "NEXT_PUBLIC_SITE_URL",
    service: "atlas",
    requirement: "required",
    purpose: "公開サイト URL（SEO / OGP / 戻り先）",
  },
  {
    key: "NEXT_PUBLIC_APP_URL",
    service: "atlas",
    requirement: "recommended",
    purpose: "アプリ URL（未設定時は SITE_URL / VERCEL_URL）",
  },
  {
    key: "ATLAS_OWNER_EMAILS",
    service: "atlas",
    requirement: "required",
    purpose: "オーナー管理画面の許可メール一覧",
  },
  {
    key: "ATLAS_OPERATOR_BUSINESS_NAME",
    service: "atlas",
    requirement: "required",
    purpose: "特商法・販売事業者名",
  },
  {
    key: "ATLAS_OPERATOR_REPRESENTATIVE_NAME",
    service: "atlas",
    requirement: "required",
    purpose: "特商法・運営責任者名",
  },
  {
    key: "ATLAS_OPERATOR_ADDRESS",
    service: "atlas",
    requirement: "required",
    purpose: "特商法・公開用所在地",
  },
  {
    key: "ATLAS_OPERATOR_CONTACT_EMAIL",
    service: "atlas",
    requirement: "required",
    purpose: "特商法・公開問い合わせメール",
  },
  {
    key: "CRON_SECRET",
    service: "vercel_cron",
    requirement: "required",
    purpose: "自動化 tick（/api/automations/tick）の Cron 認証",
  },
  {
    key: "OAUTH_STATE_SECRET",
    service: "atlas",
    requirement: "recommended",
    purpose: "OAuth CSRF state 署名（未設定時は CLERK_SECRET_KEY）",
  },
  {
    key: "STRIPE_SECRET_KEY",
    service: "stripe",
    requirement: "required",
    purpose: "Stripe サーバー秘密鍵（本番課金）",
  },
  {
    key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    service: "stripe",
    requirement: "required",
    purpose: "Stripe 公開可能キー",
  },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    service: "stripe",
    requirement: "required",
    purpose: "Stripe Webhook 署名検証",
  },
  {
    key: "STRIPE_PRICE_LIGHT",
    service: "stripe",
    requirement: "required",
    purpose: "Light プラン Price ID",
  },
  {
    key: "STRIPE_PRICE_STANDARD",
    service: "stripe",
    requirement: "required",
    purpose: "Standard プラン Price ID",
  },
  {
    key: "STRIPE_PRICE_PREMIUM",
    service: "stripe",
    requirement: "required",
    purpose: "Premium プラン Price ID",
  },
  {
    key: "SUPABASE_URL",
    service: "supabase",
    requirement: "recommended",
    purpose: "Supabase プロジェクト URL",
    aliases: ["NEXT_PUBLIC_SUPABASE_URL"],
  },
  {
    key: "SUPABASE_ANON_KEY",
    service: "supabase",
    requirement: "recommended",
    purpose: "Supabase anon キー",
    aliases: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    service: "supabase",
    requirement: "recommended",
    purpose: "サーバー専用（atlas_user_state 書き込み / RLS バイパス）",
  },
  {
    key: "NEXT_PUBLIC_ATLAS_PROJECT_STORAGE",
    service: "supabase",
    requirement: "optional",
    purpose: "Projects 保存先（supabase / localStorage）",
  },
  {
    key: "GOOGLE_CLIENT_ID",
    service: "google",
    requirement: "recommended",
    purpose: "Google OAuth クライアント ID",
  },
  {
    key: "GOOGLE_CLIENT_SECRET",
    service: "google",
    requirement: "recommended",
    purpose: "Google OAuth クライアントシークレット",
  },
  {
    key: "GOOGLE_REDIRECT_URI",
    service: "google",
    requirement: "optional",
    purpose: "Google OAuth リダイレクト URI（未設定時は自動解決）",
  },
  {
    key: "DROPBOX_APP_KEY",
    service: "dropbox",
    requirement: "recommended",
    purpose: "Dropbox アプリキー",
  },
  {
    key: "DROPBOX_APP_SECRET",
    service: "dropbox",
    requirement: "recommended",
    purpose: "Dropbox アプリシークレット",
  },
  {
    key: "DROPBOX_REDIRECT_URI",
    service: "dropbox",
    requirement: "optional",
    purpose: "Dropbox OAuth リダイレクト URI",
  },
  {
    key: "LINE_CHANNEL_ACCESS_TOKEN",
    service: "line",
    requirement: "recommended",
    purpose: "LINE Messaging API アクセストークン",
  },
  {
    key: "LINE_CHANNEL_SECRET",
    service: "line",
    requirement: "recommended",
    purpose: "LINE Webhook 署名検証シークレット",
  },
  {
    key: "LINE_BOT_BASIC_ID",
    service: "line",
    requirement: "optional",
    purpose: "LINE Bot Basic ID（友だち追加案内）",
  },
] as const;
