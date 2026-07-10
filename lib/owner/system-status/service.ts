import "server-only";

import { buildSystemStatusSnapshot } from "./engine";
import { isSystemServiceId } from "./registry";
import { setSystemServiceStatusOverride } from "./store";
import type {
  SystemServiceId,
  SystemServiceStatus,
  SystemStatusSnapshot,
} from "./types";

export function getSystemStatusSnapshot(
  now: Date = new Date(),
): SystemStatusSnapshot {
  return buildSystemStatusSnapshot(now);
}

export function parseSystemStatusPatchBody(body: unknown):
  | { serviceId: SystemServiceId; status: SystemServiceStatus | null }
  | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object" };
  }

  const record = body as { serviceId?: unknown; status?: unknown };

  if (typeof record.serviceId !== "string" || !isSystemServiceId(record.serviceId)) {
    return { error: "serviceId is invalid" };
  }

  if (
    record.status !== null &&
    record.status !== "operational" &&
    record.status !== "outage" &&
    record.status !== "maintenance"
  ) {
    return { error: "status must be operational, outage, maintenance, or null" };
  }

  return {
    serviceId: record.serviceId,
    status: record.status as SystemServiceStatus | null,
  };
}

export function applySystemStatusPatch(input: {
  serviceId: SystemServiceId;
  status: SystemServiceStatus | null;
}): SystemStatusSnapshot {
  if (input.status === "operational" || input.status === null) {
    setSystemServiceStatusOverride(input.serviceId, null);
  } else {
    setSystemServiceStatusOverride(input.serviceId, input.status);
  }

  return getSystemStatusSnapshot();
}
