import { DOMAIN_SOT_TABLE, listMixedSotDomains } from "./domains";
import { DURABLE_SOT_FINDINGS, findingsByCriticality } from "./findings";
import {
  MIGRATION_TARGETS,
  PHASE_1_2_TARGETS,
  RECOMMENDED_MIGRATION_ORDER,
} from "./migration-targets";
import { MULTI_INSTANCE_SCENARIOS } from "./multi-instance";
import { RESTART_SCENARIOS } from "./restart-scenarios";
import type { DurableSotAuditReport } from "./types";

export * from "./types";
export {
  DOMAIN_SOT_TABLE,
  listMixedSotDomains,
  getDomainSot,
} from "./domains";
export { DURABLE_SOT_FINDINGS, findingsByCriticality } from "./findings";
export { RESTART_SCENARIOS } from "./restart-scenarios";
export { MULTI_INSTANCE_SCENARIOS } from "./multi-instance";
export {
  MIGRATION_TARGETS,
  RECOMMENDED_MIGRATION_ORDER,
  PHASE_1_2_TARGETS,
} from "./migration-targets";

export const UNCONFIRMED: readonly string[] = [
  "Remote Supabase migration apply status for atlas_work_queue_* / atlas_automations / atlas_automation_runs (docs/development/pre-pro-migrations.md)",
  "Whether production Vercel always has DATABASE_URL for Work Queue Postgres store",
  "Direct runtime repository usage of atlas_automations / atlas_automation_runs tables (migration present; memory-store still primary in code)",
  "Local .data/attachments file writes (documented; runtime local-store is memory Map)",
  "Whether Clerk private metadata still holds any leftover automation payloads in live tenants",
];

export const UNCERTAINTIES: readonly string[] = [
  "Exact race windows under Vercel fluid compute / multi-region not measured in this audit",
  "Whether any production traffic still hits ATLAS_WORK_QUEUE_FORCE_FILE",
  "Volume of void persistDurableDomain losses under real write latency",
  "Dropbox credential durability path completeness vs google/x/wordpress dedicated tables",
];

/** Build the curated Durable SoT audit report (code-derived classifications). */
export function buildDurableSotAuditReport(
  now: Date = new Date(),
): DurableSotAuditReport {
  return {
    phase: "1-1-durable-sot-audit",
    generatedAt: now.toISOString(),
    domains: [...DOMAIN_SOT_TABLE],
    findings: [...DURABLE_SOT_FINDINGS],
    restartScenarios: [...RESTART_SCENARIOS],
    multiInstance: [...MULTI_INSTANCE_SCENARIOS],
    migrationTargets: [...MIGRATION_TARGETS],
    recommendedOrder: [...RECOMMENDED_MIGRATION_ORDER],
    nextPhase12Targets: [...PHASE_1_2_TARGETS],
    unconfirmed: [...UNCONFIRMED],
    uncertainties: [...UNCERTAINTIES],
  };
}

export function summarizeDurableSotAudit() {
  const mixed = listMixedSotDomains();
  return {
    domainCount: DOMAIN_SOT_TABLE.length,
    mixedSotCount: mixed.length,
    mixedDomains: mixed.map((d) => d.domain),
    p0: findingsByCriticality("P0").map((f) => f.id),
    p1: findingsByCriticality("P1").map((f) => f.id),
    p2: findingsByCriticality("P2").map((f) => f.id),
    restartCaseCount: RESTART_SCENARIOS.length,
    multiInstanceCaseCount: MULTI_INSTANCE_SCENARIOS.length,
    migrationTargetCount: MIGRATION_TARGETS.length,
    phase12: PHASE_1_2_TARGETS,
  };
}
