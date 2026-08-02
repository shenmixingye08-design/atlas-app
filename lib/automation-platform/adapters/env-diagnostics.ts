/**
 * Live execution environment diagnostics — never returns secret values.
 */

export type EnvDiagStatus =
  | "configured"
  | "missing"
  | "invalid"
  | "unknown";

export type EnvDiagItem = {
  id: string;
  label: string;
  status: EnvDiagStatus;
  detail: string;
  requiredFor: string[];
};

function present(keys: string[]): boolean {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}

function anyPresent(keys: string[]): boolean {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

export function diagnoseAutomationLiveEnvironment(): EnvDiagItem[] {
  const items: EnvDiagItem[] = [
    {
      id: "openai",
      label: "OpenAI",
      status: present(["OPENAI_API_KEY"]) ? "configured" : "missing",
      detail: present(["OPENAI_API_KEY"])
        ? "OPENAI_API_KEY is set"
        : "OPENAI_API_KEY is missing",
      requiredFor: ["vision_analysis", "ocr", "data_extract"],
    },
    {
      id: "storage",
      label: "Deliverable Storage",
      status: anyPresent(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"])
        ? "configured"
        : "missing",
      detail: "Supabase URL presence (service role checked separately in runtime)",
      requiredFor: ["word_generate", "excel_generate", "pdf_generate", "powerpoint_generate"],
    },
    {
      id: "db",
      label: "Durable Domain DB",
      status: present(["SUPABASE_SERVICE_ROLE_KEY"]) ? "configured" : "missing",
      detail: present(["SUPABASE_SERVICE_ROLE_KEY"])
        ? "SUPABASE_SERVICE_ROLE_KEY is set"
        : "SUPABASE_SERVICE_ROLE_KEY is missing",
      requiredFor: ["queue", "idempotency", "audit"],
    },
    {
      id: "queue_worker",
      label: "Queue / Worker",
      status: present(["SUPABASE_SERVICE_ROLE_KEY"]) ? "configured" : "missing",
      detail:
        "DB-backed durable runs + dispatch leases (atlasAutomationDispatchV2). No separate Redis/SQS broker in this environment.",
      requiredFor: ["schedule", "retry", "worker_restart"],
    },
    {
      id: "x_oauth",
      label: "X OAuth",
      status:
        present(["X_CLIENT_ID", "X_CLIENT_SECRET"]) ||
        present(["X_TEST_ACCESS_TOKEN"])
          ? "configured"
          : "missing",
      detail: "App credentials presence only (user tokens checked per-user)",
      requiredFor: ["x_post"],
    },
    {
      id: "google_oauth",
      label: "Google OAuth (Gmail/Calendar)",
      status: present(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])
        ? "configured"
        : "missing",
      detail: "App credentials presence only",
      requiredFor: ["gmail", "google_calendar"],
    },
    {
      id: "wordpress",
      label: "WordPress credentials encryption",
      status: present(["ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY"])
        ? "configured"
        : "missing",
      detail: "Encryption key presence; site credentials are per-user",
      requiredFor: ["wordpress"],
    },
    {
      id: "dropbox",
      label: "Dropbox OAuth",
      status:
        (anyPresent(["DROPBOX_APP_KEY", "DROPBOX_CLIENT_ID"]) &&
          anyPresent(["DROPBOX_APP_SECRET", "DROPBOX_CLIENT_SECRET"]))
          ? "configured"
          : "missing",
      detail: "App credentials presence only",
      requiredFor: ["dropbox"],
    },
    {
      id: "push",
      label: "Web Push (VAPID)",
      status:
        anyPresent(["VAPID_PUBLIC_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY"]) &&
        present(["VAPID_PRIVATE_KEY"])
          ? "configured"
          : "missing",
      detail: "VAPID keys presence; subscriptions are per-user",
      requiredFor: ["push_notification"],
    },
    {
      id: "email_delivery",
      label: "Email notification delivery",
      status: "missing",
      detail: "No deliverEmail provider is implemented in-repo",
      requiredFor: ["email_notification"],
    },
    {
      id: "live_external_flag",
      label: "AUTOMATION_E2E_LIVE_EXTERNAL",
      status:
        process.env.AUTOMATION_E2E_LIVE_EXTERNAL === "true"
          ? "configured"
          : "missing",
      detail:
        process.env.AUTOMATION_E2E_LIVE_EXTERNAL === "true"
          ? "Live E2E suite may hit real external APIs"
          : "Optional Live E2E opt-in only — production adapters call real services when user OAuth is connected",
      requiredFor: ["live_e2e_external_scenarios"],
    },
  ];

  return items;
}
