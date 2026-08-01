import type { OpsJobCase, OpsJobCategory } from "@/lib/ops-durability/types";

function pad(n: number, w = 3): string {
  return String(n).padStart(w, "0");
}

function buildCategory(
  category: OpsJobCategory,
  count: number,
  prefix: string
): OpsJobCase[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const token = `${prefix}-${pad(n)}-${1000 + n * 13}`;
    return {
      caseId: `ops_${prefix}_${pad(n)}`,
      category,
      title: `${category} ${pad(n)}`,
      uniqueToken: token,
    };
  });
}

/**
 * 500 unique job cases — no content cloning.
 * Vision cases may be excluded from success denom when OpenAI is missing.
 */
export function buildOpsJobCases(): OpsJobCase[] {
  return [
    ...buildCategory("deliverable_generate", 150, "gen"),
    ...buildCategory("vision_analyze", 100, "vis"),
    ...buildCategory("convert", 100, "cvt"),
    ...buildCategory("revision", 50, "rev"),
    ...buildCategory("notify_attached", 50, "ntf"),
    ...buildCategory("external_action", 50, "ext"),
  ];
}

export const OPS_JOB_CASES = buildOpsJobCases();

export function assertOpsJobCaseCounts(cases = OPS_JOB_CASES): void {
  if (cases.length < 500) throw new Error(`jobs < 500: ${cases.length}`);
  const ids = new Set(cases.map((c) => c.caseId));
  if (ids.size !== cases.length) throw new Error("duplicate job caseId");
  const tokens = new Set(cases.map((c) => c.uniqueToken));
  if (tokens.size !== cases.length) throw new Error("duplicate job token");
}
