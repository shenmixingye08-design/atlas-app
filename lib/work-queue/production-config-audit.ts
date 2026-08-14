import { existsSync } from "node:fs";
import { join } from "node:path";

import { resolveAtlasPostgresUrl } from "@/lib/db/postgres-url";

export type ProductionConfigPresence = {
  key: string;
  present: boolean;
  required: boolean;
  note: string;
};

export type ProductionConfigAudit = {
  items: ProductionConfigPresence[];
  missingRequired: string[];
  verdict: "ready" | "EXTERNAL CONFIGURATION REQUIRED";
};

function envPresent(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function workflowPresent(): boolean {
  return existsSync(
    join(process.cwd(), ".github/workflows/minute-scheduler.yml"),
  );
}

/**
 * Presence-only Production config audit. Never returns secret values.
 * Live Scheduler cannot be verified from this process alone.
 */
export function auditSchedulerProductionConfig(): ProductionConfigAudit {
  const postgres = resolveAtlasPostgresUrl();
  const items: ProductionConfigPresence[] = [
    {
      key: "CRON_SECRET",
      present: envPresent("CRON_SECRET"),
      required: true,
      note: "Authorization header for /api/automations/tick and /api/worker/drain",
    },
    {
      key: "ATLAS_APP_URL",
      present: envPresent("ATLAS_APP_URL"),
      required: true,
      note: "GitHub Actions minute scheduler target (Production host)",
    },
    {
      key: "ENABLE_SCHEDULED_CRON",
      present: process.env.ENABLE_SCHEDULED_CRON?.trim().toLowerCase() !== "false",
      required: true,
      note: "Kill switch — false skips due work",
    },
    {
      key: "POSTGRES_URL_OR_SUPABASE",
      present: Boolean(postgres.connectionString),
      required: true,
      note: "Durable work-queue / V2 SoT",
    },
    {
      key: "ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY",
      present: envPresent("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY"),
      required: true,
      note: "Provider credential encryption",
    },
    {
      key: "GITHUB_ACTIONS_MINUTE_WORKFLOW",
      present: workflowPresent(),
      required: true,
      note: "Hobby Vercel cron is daily only — minute SoT is GHA",
    },
    {
      key: "VERCEL_PRO_MINUTE_CRON",
      present: existsSync(join(process.cwd(), "vercel.cron.pro.json")),
      required: false,
      note: "Optional after Vercel Pro upgrade; Hobby cannot deploy * * * * *",
    },
  ];
  const missingRequired = items
    .filter((item) => item.required && !item.present)
    .map((item) => item.key);
  return {
    items,
    missingRequired,
    verdict:
      missingRequired.length === 0
        ? "ready"
        : "EXTERNAL CONFIGURATION REQUIRED",
  };
}
