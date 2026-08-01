import { listCapabilityFlags } from "./capability-flags";
import { listKillSwitches } from "./kill-switch";

export type PublicStatusComponentId =
  | "web_app"
  | "ai_processing"
  | "vision"
  | "artifact_generation"
  | "storage"
  | "notifications"
  | "external_integrations"
  | "billing";

export type IncidentPhase =
  | "investigating"
  | "identified"
  | "fixing"
  | "resolved"
  | "postmortem";

export type PublicStatusComponent = {
  id: PublicStatusComponentId;
  label: string;
  status: "operational" | "degraded" | "outage" | "maintenance";
  detail: string | null;
};

export type PublicIncident = {
  id: string;
  title: string;
  phase: IncidentPhase;
  components: PublicStatusComponentId[];
  updatedAt: string;
  publicNote: string;
};

const INCIDENT_PHASE_LABEL: Record<IncidentPhase, string> = {
  investigating: "調査中",
  identified: "原因特定",
  fixing: "復旧作業中",
  resolved: "復旧済み",
  postmortem: "事後報告",
};

export function incidentPhaseLabel(phase: IncidentPhase): string {
  return INCIDENT_PHASE_LABEL[phase];
}

/**
 * Derive user-facing status components from kill switches + capability flags.
 * Does not expose internal infra details.
 */
export function getPublicStatusComponents(): PublicStatusComponent[] {
  const kills = listKillSwitches();
  const engaged = (id: string) =>
    Boolean(kills.find((k) => k.id === id && k.engaged));
  const flagOff = (id: string) =>
    listCapabilityFlags().find((f) => f.id === id)?.state === "off";

  const visionDown = engaged("vision") || engaged("openai_all") || flagOff("vision");
  const billingDown = engaged("billing") || flagOff("billing");
  const externalDown =
    engaged("external_all") ||
    (engaged("x_post") &&
      engaged("email_send") &&
      engaged("calendar_write") &&
      engaged("wordpress_publish") &&
      engaged("dropbox_write"));
  const jobsDown = engaged("new_jobs") || engaged("openai_all");
  const notifyDown = flagOff("push") && flagOff("email_notify");

  return [
    {
      id: "web_app",
      label: "Webアプリ",
      status: "operational",
      detail: null,
    },
    {
      id: "ai_processing",
      label: "AI処理",
      status: engaged("openai_all") || jobsDown ? "outage" : "operational",
      detail: engaged("openai_all") ? "一時停止中" : null,
    },
    {
      id: "vision",
      label: "Vision",
      status: visionDown ? "maintenance" : "operational",
      detail: visionDown ? "公開準備のため一時停止" : null,
    },
    {
      id: "artifact_generation",
      label: "成果物生成",
      status: jobsDown ? "outage" : "operational",
      detail: jobsDown ? "新規処理を一時停止" : null,
    },
    {
      id: "storage",
      label: "Storage",
      status: engaged("large_upload") ? "degraded" : "operational",
      detail: engaged("large_upload") ? "大容量アップロード停止中" : null,
    },
    {
      id: "notifications",
      label: "通知",
      status: notifyDown ? "maintenance" : "operational",
      detail: notifyDown ? "Push/メール通知は未公開" : null,
    },
    {
      id: "external_integrations",
      label: "外部連携",
      status: externalDown || flagOff("x_post") ? "maintenance" : "operational",
      detail: "外部投稿・送信は公開対象外のため停止",
    },
    {
      id: "billing",
      label: "課金",
      status: billingDown ? "maintenance" : "operational",
      detail: billingDown ? "招待制・検証完了まで制限" : null,
    },
  ];
}

type IncidentBucket = {
  incidents: PublicIncident[];
};

function getIncidentBucket(): IncidentBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasPublicIncidents?: IncidentBucket;
  };
  if (!scope.__atlasPublicIncidents) {
    scope.__atlasPublicIncidents = { incidents: [] };
  }
  return scope.__atlasPublicIncidents;
}

export function listPublicIncidents(limit = 20): PublicIncident[] {
  return getIncidentBucket().incidents.slice(0, limit);
}

export function upsertPublicIncident(
  incident: Omit<PublicIncident, "updatedAt"> & { updatedAt?: string }
): PublicIncident {
  const bucket = getIncidentBucket();
  const next: PublicIncident = {
    ...incident,
    updatedAt: incident.updatedAt ?? new Date().toISOString(),
  };
  const idx = bucket.incidents.findIndex((i) => i.id === next.id);
  if (idx >= 0) bucket.incidents[idx] = next;
  else bucket.incidents.unshift(next);
  if (bucket.incidents.length > 100) bucket.incidents.length = 100;
  return next;
}
