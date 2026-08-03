/**
 * Write Phase 2-1 Scheduler audit CI artifacts.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildSchedulerAuditSnapshot } from "./inventory";
import type { SchedulerAuditSnapshot } from "./types";

export const DEFAULT_SCHEDULER_AUDIT_DIR =
  process.env.SCHEDULER_AUDIT_ARTIFACT_DIR?.trim() ||
  "artifacts/scheduler-audit-2-1";

export function buildPhase22PlanMarkdown(snapshot: SchedulerAuditSnapshot): string {
  const p0 = snapshot.risks.filter((r) => r.severity === "P0");
  const p1 = snapshot.risks.filter((r) => r.severity === "P1");
  const candidates = snapshot.risks.filter((r) => r.phase22Candidate);

  return `# Scheduler Phase 2-2 Plan (from 2-1 audit)

Generated: ${snapshot.generatedAt}

## Goal

Implement the minimum production-hardening set identified by Phase 2-1.
Do **not** replace Scheduler/Worker/Queue wholesale.

## Priority order

### P0 (must)

${p0
  .map(
    (r, i) =>
      `${i + 1}. **${r.title}** (\`${r.id}\`)\n   - Current: ${r.currentBehavior}\n   - Fix: ${r.requiredFix}`,
  )
  .join("\n\n")}

### P1 (should)

${p1
  .map(
    (r, i) =>
      `${i + 1}. **${r.title}** (\`${r.id}\`)\n   - Fix: ${r.requiredFix}`,
  )
  .join("\n\n")}

## Confirmed 2-2 work items

1. Cron / Secret 一本化（GH Actions vs Vercel daily の役割明示 + fail-closed ops checks）
2. Due tick transaction（enqueue成功後のみ nextRun 更新）
3. V2 due tick hydration / owner discovery
4. occurrence dedupe の明示配線（claimAutomationTickSlot の整理含む）
5. Scheduler History（durable）
6. Health endpoint 強化（multi-instance heartbeat）
7. Preview / Production 分離（auth + ENABLE_SCHEDULED_CRON defaults）
8. 分単位実行の本番証明（live evidence）
9. fail-closed 維持（未認証 / secret欠落）

## Explicitly out of scope for 2-2 (unless promoted)

- Scheduler全面置換
- Worker/Queue全面置換
- minutely/hourly schedule preset 新機能
- UI / Memory / 外部連携変更

## Phase 2-2 candidates from risk register

${candidates.map((c) => `- [${c.severity}] ${c.id}: ${c.title}`).join("\n")}

## Acceptance for 2-2 (draft)

- Minute path proven with durable history OR Pro cron active with evidence
- V2 due hydration fixed or V2 schedule explicitly disabled in cron
- nextRun advance only after durable job/run create
- Scheduler History persists scheduledAt/executedAt/delay/outcome
- Health heartbeat durable across instances
- No unauthenticated tick in production (already true; keep regression tests)
`;
}

export function writeSchedulerAuditArtifacts(
  dir: string = DEFAULT_SCHEDULER_AUDIT_DIR,
): {
  dir: string;
  files: string[];
  snapshot: SchedulerAuditSnapshot;
} {
  const snapshot = buildSchedulerAuditSnapshot();
  mkdirSync(dir, { recursive: true });

  const files: Array<{ name: string; body: string }> = [
    {
      name: "scheduler-audit.json",
      body: JSON.stringify(snapshot, null, 2),
    },
    {
      name: "cron-inventory.json",
      body: JSON.stringify(
        {
          generatedAt: snapshot.generatedAt,
          crons: snapshot.crons,
          activeVercel: snapshot.crons.filter((c) => c.activeInRepo && c.sourceFile === "vercel.json"),
          githubMinute: snapshot.crons.filter((c) => c.sourceFile.includes("minute-scheduler")),
        },
        null,
        2,
      ),
    },
    {
      name: "scheduler-secrets-audit.json",
      body: JSON.stringify(
        {
          generatedAt: snapshot.generatedAt,
          secrets: snapshot.secrets,
        },
        null,
        2,
      ),
    },
    {
      name: "next-run-at-paths.json",
      body: JSON.stringify(
        {
          generatedAt: snapshot.generatedAt,
          paths: snapshot.nextRunAtPaths,
        },
        null,
        2,
      ),
    },
    {
      name: "scheduler-risk-register.json",
      body: JSON.stringify(
        {
          generatedAt: snapshot.generatedAt,
          risks: snapshot.risks,
          p0: snapshot.risks.filter((r) => r.severity === "P0"),
          p1: snapshot.risks.filter((r) => r.severity === "P1"),
          p2: snapshot.risks.filter((r) => r.severity === "P2"),
        },
        null,
        2,
      ),
    },
    {
      name: "scheduler-phase-2-2-plan.md",
      body: buildPhase22PlanMarkdown(snapshot),
    },
  ];

  const written: string[] = [];
  for (const file of files) {
    const path = join(dir, file.name);
    writeFileSync(path, file.body, "utf8");
    written.push(path);
  }

  return { dir, files: written, snapshot };
}
