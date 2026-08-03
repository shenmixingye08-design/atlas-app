import type { IntegrationService, ProductionConfigCheck } from "./types";

function present(keys: string[]): boolean {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}

function anyPresent(keys: string[]): boolean {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

function check(
  service: IntegrationService | "platform",
  key: string,
  ok: boolean,
  adminMessage: string,
  userMessage: string,
  warn = false,
): ProductionConfigCheck {
  return {
    ok,
    service,
    key,
    status: ok ? "ok" : warn ? "warn" : "needs_configuration",
    adminMessage,
    userMessage,
  };
}

/** Production configuration probe — missing secrets → needs_configuration. */
export function validateProductionAdapterConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProductionConfigCheck[] {
  const checks: ProductionConfigCheck[] = [];

  checks.push(
    check(
      "platform",
      "OAUTH_STATE_SECRET",
      anyPresent(["OAUTH_STATE_SECRET", "CLERK_SECRET_KEY"]),
      "OAuth state HMAC secret missing",
      "連携の準備が完了していません。管理者にお問い合わせください。",
    ),
  );

  checks.push(
    check(
      "google_drive",
      "GOOGLE_CLIENT_ID",
      present(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]),
      "Google OAuth client missing",
      "Google連携の設定が未完了です。",
    ),
  );
  checks.push(
    check(
      "gmail",
      "GOOGLE_CLIENT_ID",
      present(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]),
      "Google OAuth client missing",
      "Gmail連携の設定が未完了です。",
    ),
  );
  checks.push(
    check(
      "google_calendar",
      "GOOGLE_CLIENT_ID",
      present(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]),
      "Google OAuth client missing",
      "カレンダー連携の設定が未完了です。",
    ),
  );

  checks.push(
    check(
      "x",
      "X_CLIENT_ID",
      present(["X_CLIENT_ID", "X_CLIENT_SECRET"]) ||
        anyPresent(["X_TEST_ACCESS_TOKEN"]),
      "X OAuth client missing",
      "X連携の設定が未完了です。",
    ),
  );

  checks.push(
    check(
      "dropbox",
      "DROPBOX_APP_KEY",
      (anyPresent(["DROPBOX_APP_KEY", "DROPBOX_CLIENT_ID"]) &&
        anyPresent(["DROPBOX_APP_SECRET", "DROPBOX_CLIENT_SECRET"])) ||
        false,
      "Dropbox OAuth app missing",
      "Dropbox連携の設定が未完了です。",
    ),
  );

  checks.push(
    check(
      "wordpress",
      "ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY",
      anyPresent(["ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY"]),
      "WordPress credential encryption key missing",
      "WordPress連携の暗号化設定が未完了です。",
    ),
  );

  checks.push(
    check(
      "supabase_storage",
      "SUPABASE_URL",
      anyPresent(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]) &&
        anyPresent(["SUPABASE_SERVICE_ROLE_KEY"]),
      "Supabase Storage not fully configured",
      "保存基盤の設定が未完了です。",
      true,
    ),
  );

  checks.push(
    check(
      "push",
      "VAPID_PUBLIC_KEY",
      present(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]),
      "Web Push VAPID keys missing",
      "プッシュ通知の設定が未完了です。",
      true,
    ),
  );

  checks.push(
    check(
      "line",
      "LINE_CHANNEL_ACCESS_TOKEN",
      anyPresent(["LINE_CHANNEL_ACCESS_TOKEN"]) &&
        anyPresent(["LINE_CHANNEL_SECRET"]),
      "LINE Messaging API not configured",
      "LINE通知の設定が未完了です。",
      true,
    ),
  );

  // Explicit production: sandbox disabled
  const sandboxForbidden =
    env.USE_SANDBOX?.trim() ||
    env.INTEGRATION_MODE?.trim().toLowerCase() === "sandbox" ||
    env.ATLAS_ALLOW_SANDBOX_ADAPTERS?.trim();
  checks.push(
    check(
      "platform",
      "SANDBOX_DISABLED",
      !sandboxForbidden,
      "Sandbox flags must be unset in production",
      "本番設定に問題があります。",
    ),
  );

  return checks;
}

export function isServiceConfigured(
  service: IntegrationService,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const checks = validateProductionAdapterConfig(env).filter(
    (c) => c.service === service,
  );
  if (checks.length === 0) return false;
  return checks.every((c) => c.ok || c.status === "warn");
}
