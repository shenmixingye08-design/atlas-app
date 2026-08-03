import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DOMAIN_SOT_TABLE,
  MULTI_INSTANCE_SCENARIOS,
  RESTART_SCENARIOS,
  buildDurableSotAuditReport,
  findingsByCriticality,
  listMixedSotDomains,
  summarizeDurableSotAudit,
} from "./index";
import {
  assertWorkQueueFileFallbackAllowed,
  listDurableSotDiagnostics,
  reportDangerousFallback,
  resetDurableSotDiagnosticsForTests,
} from "./production-diagnostics";

const ROOT = process.cwd();

describe("1-1 Durable SoT Audit", () => {
  afterEach(() => {
    resetDurableSotDiagnosticsForTests();
    vi.unstubAllEnvs();
  });

  it("covers all required audit domains", () => {
    const domains = new Set(DOMAIN_SOT_TABLE.map((d) => d.domain));
    for (const required of [
      "Automation",
      "Schedule",
      "Occurrence",
      "Run",
      "Job",
      "Step",
      "Lease",
      "Heartbeat",
      "Retry",
      "Recovery",
      "Artifact",
      "CompletionEvidence",
      "Memory",
      "Notification",
      "Metrics",
      "Idempotency",
      "ExternalAction",
      "Approval",
      "FirstExperience",
      "OAuthConnection",
      "Lock",
      "Prediction",
      "Monitoring",
      "ResultApi",
      "SavedMinutes",
      "DashboardAggregation",
      "StorageMetadata",
    ]) {
      expect(domains.has(required as never), required).toBe(true);
    }
  });

  it("declares SoT for every domain and lists mixed SoT explicitly", () => {
    for (const row of DOMAIN_SOT_TABLE) {
      expect(row.sot).toBeTruthy();
      expect(row.primaryPaths.length).toBeGreaterThan(0);
      if (row.sot === "mixed") {
        expect(row.mixedDetail, row.domain).toBeTruthy();
      }
    }
    const mixed = listMixedSotDomains();
    expect(mixed.length).toBeGreaterThan(5);
    // Visibility: mixed is not hidden
    expect(mixed.map((m) => m.domain)).toContain("Job");
    expect(mixed.map((m) => m.domain)).toContain("Run");
    expect(mixed.map((m) => m.domain)).toContain("Memory");
  });

  it("classifies P0/P1/P2 findings with evidence paths", () => {
    const p0 = findingsByCriticality("P0");
    const p1 = findingsByCriticality("P1");
    const p2 = findingsByCriticality("P2");
    expect(p0.length).toBeGreaterThan(0);
    expect(p1.length).toBeGreaterThan(0);
    expect(p2.length).toBeGreaterThan(0);
    for (const f of [...p0, ...p1, ...p2]) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.id).toMatch(/^P[012]-/);
    }
    // Surface known dangers (audit must not hide them)
    expect(p0.some((f) => f.id === "P0-WQ-FILE-FALLBACK")).toBe(true);
    expect(p0.some((f) => f.id === "P0-V2-RUN-MEMORY-SOT")).toBe(true);
    expect(p0.some((f) => f.id === "P0-EXTERNAL-BEFORE-EVIDENCE")).toBe(true);
  });

  it("documents all 8 restart scenarios A–H", () => {
    expect(RESTART_SCENARIOS.map((s) => s.id).sort().join("")).toBe(
      "ABCDEFGH",
    );
    for (const s of RESTART_SCENARIOS) {
      expect(s.codePaths.length).toBeGreaterThan(0);
      expect(s.remains.length + s.lost.length).toBeGreaterThan(0);
      expect(s.requiredFix.length).toBeGreaterThan(10);
    }
  });

  it("documents multi-instance race scenarios", () => {
    expect(MULTI_INSTANCE_SCENARIOS.length).toBeGreaterThanOrEqual(7);
    for (const s of MULTI_INSTANCE_SCENARIOS) {
      expect(s.processMemoryShared).toBe(false);
      expect(s.requiredFix.length).toBeGreaterThan(10);
    }
  });

  it("builds a complete audit report for CI artifact consumers", () => {
    const report = buildDurableSotAuditReport();
    expect(report.phase).toBe("1-1-durable-sot-audit");
    expect(report.migrationTargets.length).toBeGreaterThan(10);
    expect(report.recommendedOrder.length).toBeGreaterThanOrEqual(8);
    expect(report.nextPhase12Targets.length).toBeGreaterThan(0);
    expect(report.unconfirmed.length).toBeGreaterThan(0);
    const summary = summarizeDurableSotAudit();
    expect(summary.p0.length).toBeGreaterThan(0);
  });

  it("detects process-memory / file / browser / detached via static scanner", () => {
    const out = mkdtempSync(join(tmpdir(), "durable-sot-"));
    try {
      execFileSync(process.execPath, ["scripts/ci/durable-sot-audit.mjs"], {
        cwd: ROOT,
        env: { ...process.env, DURABLE_SOT_OUT_DIR: out },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const memory = JSON.parse(
        readFileSync(join(out, "process-memory-inventory.json"), "utf8"),
      ) as {
        totals: { uniqueGlobalSymbols: number };
        globalThisSymbols: Array<{ symbol: string; survivesRestart: boolean }>;
      };
      const files = JSON.parse(
        readFileSync(join(out, "file-fallback-inventory.json"), "utf8"),
      ) as { totals: { hits: number }; knownPaths: unknown[] };
      const browser = JSON.parse(
        readFileSync(join(out, "browser-storage-inventory.json"), "utf8"),
      ) as { totals: { localStorage: number; sessionStorage: number } };
      const detached = JSON.parse(
        readFileSync(join(out, "detached-promise-inventory.json"), "utf8"),
      ) as { totals: { hits: number }; entries: Array<{ file: string }> };
      const summary = JSON.parse(
        readFileSync(join(out, "durable-sot-audit.json"), "utf8"),
      ) as { productionReachable: Record<string, number> };

      // Visibility assertions — do NOT require zero; require detection
      expect(memory.totals.uniqueGlobalSymbols).toBeGreaterThan(20);
      expect(
        memory.globalThisSymbols.every((s) => s.survivesRestart === false),
      ).toBe(true);
      expect(
        memory.globalThisSymbols.some(
          (s) => s.symbol === "__atlasAutomationPlatformStore",
        ),
      ).toBe(true);
      expect(
        memory.globalThisSymbols.some(
          (s) => s.symbol === "__atlasDeliverableStore",
        ),
      ).toBe(true);

      expect(files.totals.hits).toBeGreaterThan(0);
      expect(files.knownPaths.length).toBeGreaterThan(0);
      expect(
        JSON.stringify(files).includes(".data/work-queue.json"),
      ).toBe(true);

      expect(browser.totals.localStorage).toBeGreaterThan(0);
      expect(
        JSON.stringify(browser).includes("lib/user-profile/store.ts"),
      ).toBe(true);

      expect(detached.totals.hits).toBeGreaterThan(10);
      expect(
        detached.entries.some((e) =>
          e.file.includes("lib/notifications/service.ts"),
        ),
      ).toBe(true);
      expect(
        detached.entries.some((e) => e.file.includes("lib/work-queue/worker.ts")),
      ).toBe(true);

      expect(summary.productionReachable.processMemoryGlobalSymbols).toBeGreaterThan(
        0,
      );
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("detects globalThis store usage at runtime diagnostic buffer", () => {
    resetDurableSotDiagnosticsForTests();
    reportDangerousFallback({
      kind: "memory_only_store",
      message: "test probe memory-only",
      soft: true,
    });
    const events = listDurableSotDiagnostics();
    expect(events.some((e) => e.kind === "memory_only_store")).toBe(true);
  });

  it("fail-fast refuses work-queue file fallback on production/ephemeral", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("ATLAS_WORK_QUEUE_FORCE_FILE", "");
    expect(() =>
      assertWorkQueueFileFallbackAllowed("unit-test-probe"),
    ).toThrow(/Work Queue file fallback refused/);
  });

  it("surfaces duplicate / mixed SoT risk in summary (does not hide)", () => {
    const summary = summarizeDurableSotAudit();
    expect(summary.mixedSotCount).toBeGreaterThan(0);
    expect(summary.p0).toContain("P0-V2-RUN-MEMORY-SOT");
    expect(summary.p0).toContain("P0-EXTERNAL-BEFORE-EVIDENCE");
  });

  it("keeps migration-plan markdown in repo", () => {
    expect(
      existsSync(
        join(ROOT, "docs/development/durable-sot-audit/migration-plan.md"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(ROOT, "docs/development/durable-sot-audit/README.md"),
      ),
    ).toBe(true);
  });
});
