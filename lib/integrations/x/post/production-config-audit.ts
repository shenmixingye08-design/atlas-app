/**
 * Production X posting prerequisites — existence only, never values.
 * Cursor / CI cannot prove Vercel Production secrets; report presence here.
 */

export type XProductionConfigItem = {
  key: string;
  present: boolean;
  requiredForLivePost: boolean;
  note: string;
};

function present(...keys: string[]): boolean {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

export function auditXProductionConfig(): XProductionConfigItem[] {
  return [
    {
      key: "X_CLIENT_ID",
      present: present("X_CLIENT_ID"),
      requiredForLivePost: true,
      note: "X OAuth 2.0 client id",
    },
    {
      key: "X_CLIENT_SECRET",
      present: present("X_CLIENT_SECRET"),
      requiredForLivePost: true,
      note: "X OAuth 2.0 client secret",
    },
    {
      key: "X_REDIRECT_URI|X_OAUTH_REDIRECT_URI",
      present: present("X_REDIRECT_URI", "X_OAUTH_REDIRECT_URI"),
      requiredForLivePost: true,
      note: "OAuth callback registered in X Developer Portal",
    },
    {
      key: "ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY",
      present: present(
        "ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY",
        "ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V1",
      ),
      requiredForLivePost: true,
      note: "Token encryption at rest",
    },
    {
      key: "NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL",
      present: present("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
      requiredForLivePost: true,
      note: "Supabase project for durable tokens / jobs",
    },
    {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      present: present("SUPABASE_SERVICE_ROLE_KEY"),
      requiredForLivePost: true,
      note: "Server-side durable store",
    },
    {
      key: "CRON_SECRET",
      present: present("CRON_SECRET"),
      requiredForLivePost: true,
      note: "/api/automations/tick scheduler auth",
    },
  ];
}

export function missingXProductionConfigKeys(): string[] {
  return auditXProductionConfig()
    .filter((item) => item.requiredForLivePost && !item.present)
    .map((item) => item.key);
}
