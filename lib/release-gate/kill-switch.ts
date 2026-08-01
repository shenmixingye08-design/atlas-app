import "server-only";

import { randomUUID } from "crypto";

import type { KillSwitchId } from "./types";

export type KillSwitchState = {
  id: KillSwitchId;
  engaged: boolean;
  reason: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

export type KillSwitchAuditEntry = {
  id: string;
  at: string;
  switchId: KillSwitchId;
  engaged: boolean;
  reason: string | null;
  actor: string | null;
};

const SWITCH_IDS: readonly KillSwitchId[] = [
  "external_all",
  "x_post",
  "email_send",
  "calendar_write",
  "wordpress_publish",
  "dropbox_write",
  "billing",
  "new_jobs",
  "large_upload",
  "vision",
  "automation",
  "openai_all",
] as const;

type Bucket = {
  switches: Map<KillSwitchId, KillSwitchState>;
  audit: KillSwitchAuditEntry[];
};

function getBucket(): Bucket {
  const scope = globalThis as typeof globalThis & {
    __atlasKillSwitches?: Bucket;
  };
  if (!scope.__atlasKillSwitches) {
    const switches = new Map<KillSwitchId, KillSwitchState>();
    for (const id of SWITCH_IDS) {
      switches.set(id, {
        id,
        engaged: false,
        reason: null,
        updatedAt: new Date(0).toISOString(),
        updatedBy: null,
      });
    }
    scope.__atlasKillSwitches = { switches, audit: [] };
  }
  return scope.__atlasKillSwitches;
}

export function listKillSwitches(): KillSwitchState[] {
  return [...getBucket().switches.values()];
}

export function isKillSwitchEngaged(id: KillSwitchId): boolean {
  return Boolean(getBucket().switches.get(id)?.engaged);
}

/** True if any of the switches is engaged. */
export function anyKillSwitchEngaged(...ids: KillSwitchId[]): boolean {
  return ids.some((id) => isKillSwitchEngaged(id));
}

export function setKillSwitch(input: {
  id: KillSwitchId;
  engaged: boolean;
  reason?: string | null;
  actor?: string | null;
}): KillSwitchState {
  const bucket = getBucket();
  const prev = bucket.switches.get(input.id);
  if (!prev) throw new Error(`unknown_kill_switch:${input.id}`);

  const next: KillSwitchState = {
    id: input.id,
    engaged: input.engaged,
    reason: input.reason?.trim() || null,
    updatedAt: new Date().toISOString(),
    updatedBy: input.actor ?? null,
  };
  bucket.switches.set(input.id, next);
  bucket.audit.unshift({
    id: `ksa_${randomUUID().slice(0, 10)}`,
    at: next.updatedAt,
    switchId: input.id,
    engaged: next.engaged,
    reason: next.reason,
    actor: next.updatedBy,
  });
  if (bucket.audit.length > 500) bucket.audit.length = 500;
  return next;
}

export function listKillSwitchAudit(limit = 100): KillSwitchAuditEntry[] {
  return getBucket().audit.slice(0, limit);
}

export function resetKillSwitchesForTests(): void {
  const bucket = getBucket();
  for (const id of SWITCH_IDS) {
    bucket.switches.set(id, {
      id,
      engaged: false,
      reason: null,
      updatedAt: new Date(0).toISOString(),
      updatedBy: null,
    });
  }
  bucket.audit = [];
}

export function killSwitchDenialResponse(id: KillSwitchId): Response {
  return Response.json(
    {
      error: "service_temporarily_unavailable",
      code: "kill_switch",
      switchId: id,
      message:
        "現在この機能は一時停止しています。復旧までお待ちください。進行中の重要な作業がある場合は設定の問い合わせからご連絡ください。",
    },
    { status: 503 }
  );
}

/**
 * Map capability routes to kill switches.
 * Returns Response if blocked, else null.
 */
export function enforceKillSwitchesForRoute(
  kind:
    | "vision"
    | "openai"
    | "x"
    | "gmail"
    | "calendar"
    | "wordpress"
    | "dropbox"
    | "billing"
    | "automation"
    | "new_job"
    | "upload"
): Response | null {
  if (anyKillSwitchEngaged("openai_all") && (kind === "vision" || kind === "openai")) {
    return killSwitchDenialResponse("openai_all");
  }
  if (kind === "vision" && isKillSwitchEngaged("vision")) {
    return killSwitchDenialResponse("vision");
  }
  if (kind === "automation" && isKillSwitchEngaged("automation")) {
    return killSwitchDenialResponse("automation");
  }
  if (kind === "new_job" && isKillSwitchEngaged("new_jobs")) {
    return killSwitchDenialResponse("new_jobs");
  }
  if (kind === "billing" && isKillSwitchEngaged("billing")) {
    return killSwitchDenialResponse("billing");
  }
  if (kind === "upload" && isKillSwitchEngaged("large_upload")) {
    return killSwitchDenialResponse("large_upload");
  }
  if (
    isKillSwitchEngaged("external_all") &&
    ["x", "gmail", "calendar", "wordpress", "dropbox"].includes(kind)
  ) {
    return killSwitchDenialResponse("external_all");
  }
  if (kind === "x" && isKillSwitchEngaged("x_post")) {
    return killSwitchDenialResponse("x_post");
  }
  if (kind === "gmail" && isKillSwitchEngaged("email_send")) {
    return killSwitchDenialResponse("email_send");
  }
  if (kind === "calendar" && isKillSwitchEngaged("calendar_write")) {
    return killSwitchDenialResponse("calendar_write");
  }
  if (kind === "wordpress" && isKillSwitchEngaged("wordpress_publish")) {
    return killSwitchDenialResponse("wordpress_publish");
  }
  if (kind === "dropbox" && isKillSwitchEngaged("dropbox_write")) {
    return killSwitchDenialResponse("dropbox_write");
  }
  return null;
}

export { SWITCH_IDS as KILL_SWITCH_IDS };
