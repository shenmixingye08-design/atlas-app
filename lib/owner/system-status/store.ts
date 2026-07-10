import { SYSTEM_SERVICE_IDS, getSystemServiceDefinition } from "./registry";
import type {
  HealthProbeEvent,
  SystemServiceId,
  SystemServiceStatus,
} from "./types";

type StatusOverrideBucket = Map<SystemServiceId, SystemServiceStatus>;
type ProbeBucket = HealthProbeEvent[];

function getOverrideBucket(): StatusOverrideBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasSystemStatusOverrides?: StatusOverrideBucket;
  };

  if (!globalScope.__atlasSystemStatusOverrides) {
    globalScope.__atlasSystemStatusOverrides = new Map();
  }

  return globalScope.__atlasSystemStatusOverrides;
}

function getProbeBucket(): ProbeBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasSystemStatusProbes?: ProbeBucket;
  };

  if (!globalScope.__atlasSystemStatusProbes) {
    globalScope.__atlasSystemStatusProbes = [];
  }

  return globalScope.__atlasSystemStatusProbes;
}

export function setSystemServiceStatusOverride(
  serviceId: SystemServiceId,
  status: SystemServiceStatus | null,
): void {
  getSystemServiceDefinition(serviceId);
  const bucket = getOverrideBucket();

  if (status === null) {
    bucket.delete(serviceId);
    return;
  }

  bucket.set(serviceId, status);
}

export function getSystemServiceStatusOverride(
  serviceId: SystemServiceId,
): SystemServiceStatus | null {
  return getOverrideBucket().get(serviceId) ?? null;
}

export function recordHealthProbe(input: {
  serviceId: SystemServiceId;
  success: boolean;
  source?: string;
  timestamp?: string;
}): HealthProbeEvent {
  getSystemServiceDefinition(input.serviceId);

  const event: HealthProbeEvent = {
    serviceId: input.serviceId,
    success: input.success,
    timestamp: input.timestamp ?? new Date().toISOString(),
    source: input.source ?? "probe",
  };

  getProbeBucket().push(event);
  return event;
}

export function listHealthProbes(): HealthProbeEvent[] {
  return [...getProbeBucket()];
}

export function hasHealthProbeRecords(): boolean {
  return getProbeBucket().length > 0;
}

export function resetSystemStatusStore(): void {
  getOverrideBucket().clear();
  getProbeBucket().length = 0;
}

export function listSystemServiceIds(): readonly SystemServiceId[] {
  return SYSTEM_SERVICE_IDS;
}
