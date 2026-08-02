import "server-only";

import { getOwnerEnvStatusSnapshot } from "@/lib/owner/env-status";
import { getCronTickState } from "@/lib/owner/monitoring/store";
import { listDrQueueJobs } from "@/lib/owner/disaster-recovery/store";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import { sampleProcessGauges } from "./metrics";
import { getConfiguredAlertChannels } from "./alerts";

export type HealthComponentId =
  | "api"
  | "storage"
  | "supabase"
  | "worker"
  | "queue"
  | "cron"
  | "openai";

export type HealthComponentStatus = {
  id: HealthComponentId;
  status: "ok" | "degraded" | "down";
  detail: string;
  checkedAt: string;
};

export type ProductionHealthSnapshot = {
  live: boolean;
  ready: boolean;
  status: "ok" | "degraded" | "down";
  components: HealthComponentStatus[];
  gauges: ReturnType<typeof sampleProcessGauges>;
  alertChannelsConfigured: string[];
  checkedAt: string;
};

function envConfigured(service: string): boolean {
  const snap = getOwnerEnvStatusSnapshot();
  const rows = snap.variables.filter((row) => row.service === service);
  if (rows.length === 0) {
    if (service === "openai") return Boolean(process.env.OPENAI_API_KEY?.trim());
    if (service === "supabase")
      return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
          (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
      );
    return false;
  }
  return !rows.some((row) => row.requirement === "required" && !row.configured);
}

async function checkSupabase(): Promise<HealthComponentStatus> {
  const checkedAt = new Date().toISOString();
  if (!envConfigured("supabase")) {
    return {
      id: "supabase",
      status: "degraded",
      detail: "Supabase未設定（ローカル/非永続モード可）",
      checkedAt,
    };
  }
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return {
      id: "supabase",
      status: "degraded",
      detail: "service role client 未構成",
      checkedAt,
    };
  }
  try {
    // Lightweight connectivity probe — table may vary; treat network error as down.
    const { error } = await client.from("atlas_user_state").select("user_id").limit(1);
    if (error && /fetch|network|ECONN|timeout/i.test(error.message)) {
      return {
        id: "supabase",
        status: "down",
        detail: error.message.slice(0, 200),
        checkedAt,
      };
    }
    return {
      id: "supabase",
      status: "ok",
      detail: error ? `reachable (${error.message.slice(0, 80)})` : "reachable",
      checkedAt,
    };
  } catch (error) {
    return {
      id: "supabase",
      status: "down",
      detail:
        error instanceof Error ? error.message.slice(0, 200) : "supabase probe failed",
      checkedAt,
    };
  }
}

function checkCron(): HealthComponentStatus {
  const checkedAt = new Date().toISOString();
  const cron = getCronTickState();
  if (!cron.lastSuccessAt && !cron.lastFailureAt) {
    return {
      id: "cron",
      status: "degraded",
      detail: "まだtick実績なし",
      checkedAt,
    };
  }
  if (cron.lastFailureAt && !cron.lastSuccessAt) {
    return { id: "cron", status: "down", detail: "直近tick失敗のみ", checkedAt };
  }
  const last = cron.lastSuccessAt ? new Date(cron.lastSuccessAt).getTime() : 0;
  const ageH = (Date.now() - last) / 3_600_000;
  if (ageH > 36) {
    return {
      id: "cron",
      status: "down",
      detail: `最終成功から ${Math.round(ageH)} 時間`,
      checkedAt,
    };
  }
  if (ageH > 26) {
    return {
      id: "cron",
      status: "degraded",
      detail: `最終成功から ${Math.round(ageH)} 時間`,
      checkedAt,
    };
  }
  return { id: "cron", status: "ok", detail: "tick正常", checkedAt };
}

function checkQueue(): HealthComponentStatus {
  const checkedAt = new Date().toISOString();
  const jobs = listDrQueueJobs();
  const queued = jobs.filter((j) => j.status === "queued" || j.status === "retrying");
  const dead = jobs.filter((j) => j.status === "dead");
  if (dead.length >= 10) {
    return {
      id: "queue",
      status: "down",
      detail: `dead=${dead.length}`,
      checkedAt,
    };
  }
  if (queued.length >= 50) {
    return {
      id: "queue",
      status: "degraded",
      detail: `滞留=${queued.length}`,
      checkedAt,
    };
  }
  return {
    id: "queue",
    status: "ok",
    detail: `queued=${queued.length} dead=${dead.length}`,
    checkedAt,
  };
}

function checkWorker(): HealthComponentStatus {
  const checkedAt = new Date().toISOString();
  const gauges = sampleProcessGauges();
  if (gauges.memoryUsagePercent > 95) {
    return {
      id: "worker",
      status: "down",
      detail: `memory ${gauges.memoryUsagePercent}%`,
      checkedAt,
    };
  }
  if (gauges.memoryUsagePercent > 85) {
    return {
      id: "worker",
      status: "degraded",
      detail: `memory ${gauges.memoryUsagePercent}%`,
      checkedAt,
    };
  }
  return {
    id: "worker",
    status: "ok",
    detail: `uptime ${gauges.uptimeSec}s`,
    checkedAt,
  };
}

function checkOpenAi(): HealthComponentStatus {
  const checkedAt = new Date().toISOString();
  if (!envConfigured("openai") && !process.env.OPENAI_API_KEY?.trim()) {
    return {
      id: "openai",
      status: "down",
      detail: "OPENAI_API_KEY 未設定",
      checkedAt,
    };
  }
  return { id: "openai", status: "ok", detail: "key configured", checkedAt };
}

function checkStorage(): HealthComponentStatus {
  const checkedAt = new Date().toISOString();
  const hasBlob =
    Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()) ||
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  if (!hasBlob) {
    return {
      id: "storage",
      status: "degraded",
      detail: "永続Storage未設定（ローカル可）",
      checkedAt,
    };
  }
  return { id: "storage", status: "ok", detail: "configured", checkedAt };
}

export async function getProductionHealthSnapshot(): Promise<ProductionHealthSnapshot> {
  const checkedAt = new Date().toISOString();
  const components: HealthComponentStatus[] = [
    {
      id: "api",
      status: "ok",
      detail: "process alive",
      checkedAt,
    },
    checkStorage(),
    await checkSupabase(),
    checkWorker(),
    checkQueue(),
    checkCron(),
    checkOpenAi(),
  ];

  const down = components.some((c) => c.status === "down");
  const degraded = components.some((c) => c.status === "degraded");
  const status = down ? "down" : degraded ? "degraded" : "ok";

  return {
    live: true,
    ready: !down,
    status,
    components,
    gauges: sampleProcessGauges(),
    alertChannelsConfigured: getConfiguredAlertChannels(),
    checkedAt,
  };
}
