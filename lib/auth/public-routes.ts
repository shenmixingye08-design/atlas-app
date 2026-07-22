/**
 * ATLAS 公開 / 保護ルート定義。
 * proxy.ts（Clerk）と SEO（sitemap）から参照する。
 */

/** ログイン不要で閲覧できるページ（パスプレフィックス） */
export const ATLAS_PUBLIC_PAGE_PATHS = [
  "/",
  "/capabilities",
  "/pricing",
  "/terms",
  "/privacy",
  "/legal",
  "/contact",
  "/sign-in",
  "/sign-up",
  "/status",
  "/offline",
  "/maintenance",
  "/404",
  "/500",
  "/solutions",
] as const;

/** ログイン必須のアプリ画面 */
export const ATLAS_PROTECTED_PAGE_MATCHERS = [
  "/chat(.*)",
  "/history(.*)",
  "/settings(.*)",
  "/projects(.*)",
  "/workspace(.*)",
  "/commander(.*)",
  "/automations(.*)",
  "/deliverables(.*)",
  "/connections(.*)",
  "/connectors(.*)",
  "/integrations(.*)",
  "/company(.*)",
  "/marketplace(.*)",
  "/mihon(.*)",
  "/notifications(.*)",
  "/reports(.*)",
  "/billing(.*)",
  "/owner(.*)",
  "/teach-work(.*)",
  "/learned-jobs(.*)",
] as const;

/** ミドルウェアで認証を強制しない公開 API */
export const ATLAS_PUBLIC_API_MATCHERS = [
  "/api/stripe/webhook(.*)",
  "/api/billing/webhook(.*)",
  "/api/billing/plans(.*)",
  "/api/maintenance(.*)",
  "/api/status(.*)",
  "/api/contact(.*)",
  "/api/automations/tick(.*)",
  "/api/feature-flags/availability(.*)",
  "/api/external-services/google/oauth/callback(.*)",
  "/api/external-services/x/oauth/callback(.*)",
  "/api/external-services/dropbox/oauth/callback(.*)",
  "/api/integrations/oauth/google-drive/callback(.*)",
  "/api/line/webhook(.*)",
  "/api/webhooks/clerk(.*)",
] as const;

/** ログイン後の既定遷移先 */
export const ATLAS_APP_HOME_PATH = "/projects";

/** 未ログイン保護ページからの案内クエリ */
export const ATLAS_LOGIN_CONTINUE_NOTICE = "continue";

export const ATLAS_LOGIN_CONTINUE_MESSAGE =
  "ログインすると続きからご利用いただけます。";
