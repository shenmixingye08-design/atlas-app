/**
 * 【ATLAS機能評価】P5 core readiness — 運用観測のみ。AI不使用。
 * 外部API実リクエスト禁止。課金・大量 token 消費禁止。
 */
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";
import { isSupabaseRelationMissingError } from "@/lib/automations/supabase-error";
import { probeSharpRuntime } from "@/lib/images/probe-sharp";

export type StoreProbeStatus = "ok" | "missing" | "unavailable";

export type CoreReadinessLevel = "healthy" | "degraded" | "unhealthy";

export type CoreReadinessChecks = {
  supabaseConfigured: boolean;
  serviceRoleConfigured: boolean;
  supabaseReachable: boolean;
  billingStore: StoreProbeStatus;
  automationStore: StoreProbeStatus;
  workJobStore: StoreProbeStatus;
  openaiConfigured: boolean;
  integrationsConfigured: boolean;
  sharpRuntime: StoreProbeStatus;
};

export type CoreReadinessSnapshot = {
  readiness: CoreReadinessLevel;
  checks: CoreReadinessChecks;
};

const REQUIRED_STORES: Array<
  keyof Pick<
    CoreReadinessChecks,
    "billingStore" | "automationStore" | "workJobStore"
  >
> = ["billingStore", "automationStore", "workJobStore"];

export function envFlagPresent(...names: string[]): boolean {
  return names.some((name) => Boolean(process.env[name]?.trim()));
}

export function classifyCoreReadiness(
  checks: CoreReadinessChecks,
): CoreReadinessLevel {
  if (
    !checks.supabaseConfigured ||
    !checks.serviceRoleConfigured ||
    !checks.supabaseReachable
  ) {
    return "unhealthy";
  }
  for (const key of REQUIRED_STORES) {
    if (checks[key] !== "ok") return "unhealthy";
  }
  if (
    !checks.openaiConfigured ||
    !checks.integrationsConfigured ||
    checks.sharpRuntime !== "ok"
  ) {
    return "degraded";
  }
  return "healthy";
}

function classifyTableError(error: unknown): StoreProbeStatus {
  if (!error) return "ok";
  if (isSupabaseRelationMissingError(error)) return "missing";
  return "unavailable";
}

type UntypedClient = {
  from: (table: string) => {
    select: (cols: string) => {
      limit: (n: number) => PromiseLike<{
        error: { message?: string; code?: string } | null;
      }>;
    };
  };
};

async function probeTable(
  client: UntypedClient,
  table: string,
): Promise<StoreProbeStatus> {
  try {
    const result = await client.from(table).select("*").limit(1);
    if (!result.error) return "ok";
    return classifyTableError(result.error);
  } catch (error) {
    return classifyTableError(error);
  }
}

export async function collectCoreReadiness(input?: {
  probeSharp?: () => Promise<{ ok: boolean }>;
  probeClient?: UntypedClient | null;
}): Promise<CoreReadinessSnapshot> {
  const env = getSupabaseServiceRoleEnv();
  const supabaseConfigured = Boolean(env?.url);
  const serviceRoleConfigured = Boolean(env?.serviceRoleKey);
  const client =
    input?.probeClient !== undefined
      ? input.probeClient
      : (createServiceRoleClientIfConfigured() as unknown as UntypedClient | null);

  let billingStore: StoreProbeStatus = "unavailable";
  let automationStore: StoreProbeStatus = "unavailable";
  let workJobStore: StoreProbeStatus = "unavailable";
  let supabaseReachable = false;

  if (client) {
    const [billing, automation, workJob] = await Promise.all([
      probeTable(client, "atlas_billing_usage_counters"),
      probeTable(client, "atlas_automation_definitions"),
      probeTable(client, "atlas_work_jobs"),
    ]);
    billingStore = billing;
    automationStore = automation;
    workJobStore = workJob;
    supabaseReachable = [billing, automation, workJob].some(
      (status) => status === "ok" || status === "missing",
    );
  }

  let sharpRuntime: StoreProbeStatus = "unavailable";
  try {
    const probe = input?.probeSharp ?? probeSharpRuntime;
    const sharp = await probe();
    sharpRuntime = sharp.ok ? "ok" : "unavailable";
  } catch {
    sharpRuntime = "unavailable";
  }

  const checks: CoreReadinessChecks = {
    supabaseConfigured,
    serviceRoleConfigured,
    supabaseReachable,
    billingStore,
    automationStore,
    workJobStore,
    openaiConfigured: envFlagPresent("OPENAI_API_KEY"),
    integrationsConfigured:
      envFlagPresent("X_CLIENT_ID") ||
      envFlagPresent("GOOGLE_CLIENT_ID") ||
      envFlagPresent("DROPBOX_APP_KEY", "DROPBOX_CLIENT_ID"),
    sharpRuntime,
  };

  return {
    readiness: classifyCoreReadiness(checks),
    checks,
  };
}

export function coreReadinessHttpStatus(
  readiness: CoreReadinessLevel,
): 200 | 503 {
  return readiness === "unhealthy" ? 503 : 200;
}

export function coreReadinessPublicStatus(
  readiness: CoreReadinessLevel,
): "ok" | "degraded" | "unavailable" {
  if (readiness === "healthy") return "ok";
  if (readiness === "degraded") return "degraded";
  return "unavailable";
}
