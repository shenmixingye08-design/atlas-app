import {
  LAUNCH_KPI_DEFINITIONS,
  LAUNCH_MIN_SAMPLES,
  type LaunchBand,
  type LaunchKpiDefinition,
  type LaunchKpiId,
} from "@/lib/owner/launch-verdict/thresholds";

export type LaunchKpiBand = LaunchBand | "insufficient";

export type LaunchKpiMeasurement = {
  id: LaunchKpiId;
  label: string;
  value: number | null;
  unit: LaunchKpiDefinition["unit"];
  sampleSize: number;
  sampleOk: boolean;
  band: LaunchKpiBand;
  critical: boolean;
};

export type OverallLaunchVerdict = "go" | "delay" | "kill";

export type LaunchVerdictResult = {
  overall: OverallLaunchVerdict;
  overallLabel: string;
  signal: "🟢" | "🟡" | "🔴";
  measuredAt: string;
  kpis: LaunchKpiMeasurement[];
  needsImprovement: Array<{
    id: LaunchKpiId;
    label: string;
    band: LaunchKpiBand;
    value: number | null;
    unit: LaunchKpiDefinition["unit"];
  }>;
  ruleSummary: string;
};

/** CEO dashboard display order (fixed). */
export const LAUNCH_DASHBOARD_ORDER: readonly LaunchKpiId[] = [
  "jobCompletionRate",
  "firstCompletionRate",
  "avgCompletionSeconds",
  "errorRate",
  "retention7",
  "retention30",
  "referralRate",
  "paidConversionRate",
  "nps",
] as const;

function classifyBand(def: LaunchKpiDefinition, value: number): LaunchBand {
  if (def.direction === "higher") {
    if (def.go.min != null && value >= def.go.min) return "go";
    if (
      def.delay.min != null &&
      value >= def.delay.min &&
      (def.delay.max == null || value <= def.delay.max)
    ) {
      return "delay";
    }
    return "kill";
  }
  // lower is better
  if (def.go.max != null && value <= def.go.max) return "go";
  if (
    def.delay.max != null &&
    value <= def.delay.max &&
    (def.delay.min == null || value >= def.delay.min)
  ) {
    return "delay";
  }
  return "kill";
}

function minSampleFor(id: LaunchKpiId): number {
  if (id === "nps") return LAUNCH_MIN_SAMPLES.npsResponses;
  if (
    id === "jobCompletionRate" ||
    id === "errorRate" ||
    id === "avgCompletionSeconds"
  ) {
    return LAUNCH_MIN_SAMPLES.jobs;
  }
  return LAUNCH_MIN_SAMPLES.firstRunUsers;
}

export function evaluateLaunchKpi(
  id: LaunchKpiId,
  value: number | null,
  sampleSize: number
): LaunchKpiMeasurement {
  const def = LAUNCH_KPI_DEFINITIONS.find((d) => d.id === id);
  if (!def) {
    throw new Error(`Unknown KPI: ${id}`);
  }
  const sampleOk = sampleSize >= minSampleFor(id);
  if (value === null || !Number.isFinite(value) || !sampleOk) {
    return {
      id,
      label: def.label,
      value,
      unit: def.unit,
      sampleSize,
      sampleOk: false,
      band: "insufficient",
      critical: def.critical,
    };
  }
  return {
    id,
    label: def.label,
    value,
    unit: def.unit,
    sampleSize,
    sampleOk: true,
    band: classifyBand(def, value),
    critical: def.critical,
  };
}

export function aggregateLaunchVerdict(
  measurements: LaunchKpiMeasurement[],
  measuredAt = new Date().toISOString()
): LaunchVerdictResult {
  const byOrder = LAUNCH_DASHBOARD_ORDER.map((id) => {
    const found = measurements.find((m) => m.id === id);
    return found ?? evaluateLaunchKpi(id, null, 0);
  });

  const hasCriticalKill = byOrder.some(
    (m) => m.critical && m.band === "kill"
  );
  const hasBlocker = byOrder.some(
    (m) =>
      m.band === "delay" ||
      m.band === "kill" ||
      m.band === "insufficient"
  );
  const allGo = byOrder.every((m) => m.band === "go");

  let overall: OverallLaunchVerdict;
  if (hasCriticalKill) {
    overall = "kill";
  } else if (allGo) {
    overall = "go";
  } else if (hasBlocker) {
    overall = "delay";
  } else {
    overall = "delay";
  }

  const overallLabel =
    overall === "go"
      ? "正式公開"
      : overall === "kill"
        ? "公開禁止"
        : "延期";

  const signal =
    overall === "go" ? "🟢" : overall === "kill" ? "🔴" : "🟡";

  const needsImprovement = byOrder
    .filter((m) => m.band !== "go")
    .map((m) => ({
      id: m.id,
      label: m.label,
      band: m.band,
      value: m.value,
      unit: m.unit,
    }));

  return {
    overall,
    overallLabel,
    signal,
    measuredAt,
    kpis: byOrder,
    needsImprovement,
    ruleSummary:
      "全KPIが公開基準を満たした場合のみ正式公開。1項目でも延期なら延期。重大KPIが中止なら公開禁止。サンプル不足は延期扱い。",
  };
}
