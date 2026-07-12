import { formatOwnerMonthKey } from "../format";
import { listErrorCategoryStates } from "../error-monitoring/store";
import type { ErrorCategoryId } from "../error-monitoring/types";
import {
  SYSTEM_SERVICE_IDS,
  getSystemServiceDefinition,
  mapErrorCategoryToSystemService,
} from "./registry";
import {
  getSystemServiceStatusOverride,
  listHealthProbes,
} from "./store";
import type {
  HealthProbeEvent,
  SystemServiceId,
  SystemServiceSnapshot,
  SystemServiceStatus,
  SystemStatusSnapshot,
} from "./types";

function filterProbesByMonth(
  probes: readonly HealthProbeEvent[],
  monthKey: string,
): HealthProbeEvent[] {
  return probes.filter((probe) => probe.timestamp.startsWith(monthKey));
}

function computeUptimeFromProbes(probes: readonly HealthProbeEvent[]): number | null {
  if (probes.length === 0) return null;

  const successCount = probes.filter((probe) => probe.success).length;
  return Math.round((successCount / probes.length) * 1000) / 10;
}

function detectAutoOutageServices(): Set<SystemServiceId> {
  const outageServices = new Set<SystemServiceId>();

  for (const state of listErrorCategoryStates()) {
    if (state.resolutionStatus !== "open" || state.occurrenceCount === 0) {
      continue;
    }

    const serviceId = mapErrorCategoryToSystemService(
      state.categoryId as ErrorCategoryId,
    );
    if (serviceId) {
      outageServices.add(serviceId);
    }
  }

  return outageServices;
}

function resolveServiceStatus(
  serviceId: SystemServiceId,
  autoOutageServices: Set<SystemServiceId>,
): { status: SystemServiceStatus; isManualOverride: boolean } {
  const override = getSystemServiceStatusOverride(serviceId);
  if (override) {
    return { status: override, isManualOverride: true };
  }

  if (autoOutageServices.has(serviceId)) {
    return { status: "outage", isManualOverride: false };
  }

  return { status: "operational", isManualOverride: false };
}

function resolveUptimePercent(
  status: SystemServiceStatus,
  monthProbes: readonly HealthProbeEvent[],
): { uptimePercent: number; isEstimated: boolean } {
  const probeUptime = computeUptimeFromProbes(monthProbes);
  if (probeUptime !== null) {
    return { uptimePercent: probeUptime, isEstimated: false };
  }

  // No invented uptime. Status alone is shown; percent is 0 with live=false flag off.
  if (status === "outage") {
    return { uptimePercent: 0, isEstimated: false };
  }

  return { uptimePercent: 0, isEstimated: false };
}

function resolveLastCheckedAt(
  monthProbes: readonly HealthProbeEvent[],
): string | null {
  if (monthProbes.length === 0) return null;
  return monthProbes[monthProbes.length - 1]?.timestamp ?? null;
}

export function buildSystemStatusSnapshot(
  now: Date = new Date(),
): SystemStatusSnapshot {
  const monthKey = formatOwnerMonthKey(now);
  const allProbes = listHealthProbes();
  const autoOutageServices = detectAutoOutageServices();

  const services = SYSTEM_SERVICE_IDS.map((serviceId): SystemServiceSnapshot => {
    const definition = getSystemServiceDefinition(serviceId);
    const monthProbes = filterProbesByMonth(
      allProbes.filter((probe) => probe.serviceId === serviceId),
      monthKey,
    );
    const { status, isManualOverride } = resolveServiceStatus(
      serviceId,
      autoOutageServices,
    );
    const { uptimePercent, isEstimated } = resolveUptimePercent(
      status,
      monthProbes,
    );

    return {
      serviceId,
      label: definition.label,
      status,
      uptimePercent,
      isEstimated,
      isManualOverride,
      lastCheckedAt: resolveLastCheckedAt(monthProbes),
    };
  });

  return {
    services,
    operationalCount: services.filter(
      (service) => service.status === "operational",
    ).length,
    issueCount: services.filter((service) => service.status !== "operational")
      .length,
    generatedAt: now.toISOString(),
  };
}
