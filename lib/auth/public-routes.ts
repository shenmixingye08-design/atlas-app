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
  "/api/health/version(.*)",
  // Health probes remain middleware-public so CRON Bearer can reach the handler,
  // but each handler MUST call authorizeHealthProbe (P07 lockdown).
  "/api/health/word-pipeline(.*)",
  "/api/health/word-request-trace(.*)",
  "/api/health/reliability-events(.*)",
  "/api/health/billing-schema(.*)",
  "/api/health/oauth-encryption(.*)",
  "/api/health/authz(.*)",
  "/api/health/secrets-leakage(.*)",
  "/api/health/upload-ssrf(.*)",
  "/api/health/reliability(.*)",
  "/api/health/automation-v2-db(.*)",
  "/api/health/side-effect-idempotency(.*)",
  "/api/health/notification-retry(.*)",
  "/api/health/external-monitor(.*)",
  "/api/health/pdf-tables(.*)",
  "/api/health/household-ledger(.*)",
  "/api/health/rate-limit(.*)",
  "/api/health/deliverable-quality(.*)",
  "/api/health/work-queue(.*)",
  "/api/health/api-contracts(.*)",
  "/api/health/content-quality-gate(.*)",
  "/api/health/worker-scale(.*)",
  "/api/health/structured-logs(.*)",
  "/api/health/ocr-engine(.*)",
  "/api/health/jwt-rls(.*)",
  "/api/health/vision(.*)",
  "/api/contact(.*)",
  "/api/automations/tick(.*)",
  // P2-03: Minute Scheduler horizontal drain fan-out (handler still CRON/owner gated).
  "/api/worker/drain(.*)",
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
