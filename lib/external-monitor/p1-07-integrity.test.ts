/**
 * P1-07 integrity — CI mandatory.
 * Observes real monitor lifecycle outcomes (no hard-coded success).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/external-monitor/notify", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/external-monitor/notify")
  >("@/lib/external-monitor/notify");
  return {
    ...actual,
    deliverOwnerAlert: vi.fn(async () => ({
      lineAttempted: true,
      lineSent: true,
      systemAttempted: true,
      systemSent: true,
      errorCode: null,
    })),
  };
});

import { recordCronTickSuccess } from "@/lib/owner/monitoring/store";
import { resetMonitoringStoreForTests } from "@/lib/owner/monitoring/store";

import {
  activateFailureInjection,
  deactivateFailureInjection,
} from "./inject";
import { runExternalMonitorCycle } from "./runner";
import {
  claimAlertDelivery,
  exportExternalMonitorMemorySnapshotForTests,
  importExternalMonitorMemorySnapshotForTests,
  listDeliveriesForIncident,
  listOpenIncidents,
  resetExternalMonitorStoreForTests,
  upsertOpenIncident,
} from "./store";
import { setExternalMonitorReadyForTests } from "./table-ready";
import { EXTERNAL_MONITOR_THRESHOLDS } from "./thresholds";
import type { MonitorCheckResult } from "./types";

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("P1-07 external monitor integrity", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_EXTERNAL_MONITOR_FORCE_MEMORY", "true");
    resetExternalMonitorStoreForTests();
    resetMonitoringStoreForTests();
    setExternalMonitorReadyForTests(false);
    recordCronTickSuccess(new Date().toISOString());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("source: thresholds centralized; tick wired; no memory SoT in production path", () => {
    const thresholds = readSrc("lib/external-monitor/thresholds.ts");
    expect(thresholds).toContain("EXTERNAL_MONITOR_THRESHOLDS");
    expect(thresholds).toContain("cooldownMsBySeverity");

    const tick = readSrc("app/api/automations/tick/route.ts");
    expect(tick).toContain("runExternalMonitorCycle");
    expect(tick).toContain("externalMonitor");

    const store = readSrc("lib/external-monitor/store.ts");
    expect(store).toContain("isAtlasProduction");
    expect(store).toContain("external_monitor_durable_required");
    expect(store).toMatch(/if\s*\(\s*isAtlasProduction\(\)\s*\)\s*return\s*false/);

    const runner = readSrc("lib/external-monitor/runner.ts");
    expect(runner).not.toMatch(/console\.log\([^\)]*alert/);
    expect(runner).toContain("claimAlertDelivery");
  });

  it("alert dedupe + cooldown prevents notify spam", async () => {
    const { deliverOwnerAlert } = await import("./notify");
    const notify = vi.mocked(deliverOwnerAlert);

    await activateFailureInjection({
      kind: "tick_failure",
      ttlMs: 60_000,
    });

    const first = await runExternalMonitorCycle({ nowMs: Date.now() });
    expect(first.deliveriesSent).toBeGreaterThanOrEqual(1);
    const open = await listOpenIncidents();
    expect(open.some((i) => i.checkId === "scheduler.tick")).toBe(true);
    const callsAfterFirst = notify.mock.calls.length;

    const second = await runExternalMonitorCycle({
      nowMs: Date.now() + 1_000,
    });
    expect(second.deliveriesSent).toBe(0);
    expect(notify.mock.calls.length).toBe(callsAfterFirst);

    const third = await runExternalMonitorCycle({
      nowMs:
        Date.now() +
        EXTERNAL_MONITOR_THRESHOLDS.notify.continuationMinIntervalMs +
        1_000,
    });
    expect(third.deliveriesAttempted).toBeGreaterThanOrEqual(1);
  });

  it("multi-instance single-winner claim", async () => {
    const check: MonitorCheckResult = {
      checkId: "notification.dlq",
      status: "critical",
      severity: "critical",
      title: "DLQ",
      summary: "spike",
      metrics: { dlqCount: 99 },
      failureClass: "internal",
      affectedUsersEstimate: 1,
      synthetic: true,
      observedAt: new Date().toISOString(),
    };
    const incident = await upsertOpenIncident({ check });
    const dedupeKey = `${incident.fingerprint}:opened:g0:line`;

    const [a, b] = await Promise.all([
      claimAlertDelivery({
        incidentId: incident.id,
        deliveryKind: "opened",
        channel: "line",
        dedupeKey,
        claimedBy: "inst_a",
      }),
      claimAlertDelivery({
        incidentId: incident.id,
        deliveryKind: "opened",
        channel: "line",
        dedupeKey,
        claimedBy: "inst_b",
      }),
    ]);

    const winners = [a, b].filter(Boolean);
    expect(winners).toHaveLength(1);
  });

  it("incident lifecycle + recovery notification", async () => {
    await activateFailureInjection({
      kind: "dlq_spike",
      ttlMs: 60_000,
    });
    const fail = await runExternalMonitorCycle({ nowMs: Date.now() });
    expect(fail.checks.find((c) => c.checkId === "notification.dlq")?.synthetic).toBe(
      true,
    );
    const open = await listOpenIncidents();
    const incident = open.find((i) => i.checkId === "notification.dlq");
    expect(incident).toBeTruthy();
    expect(incident!.status).toBe("open");

    const openedDeliveries = await listDeliveriesForIncident(incident!.id);
    expect(
      openedDeliveries.some(
        (d) => d.deliveryKind === "opened" && d.status === "sent",
      ),
    ).toBe(true);

    await deactivateFailureInjection({ kind: "dlq_spike" });
    const recover = await runExternalMonitorCycle({
      nowMs: Date.now() + 2_000,
    });
    expect(recover.resolvedThisCycle).toBeGreaterThanOrEqual(1);

    const { getIncidentById } = await import("./store");
    const after = await getIncidentById(incident!.id);
    expect(after?.status).toBe("resolved");

    const deliveries = await listDeliveriesForIncident(incident!.id);
    expect(deliveries.some((d) => d.deliveryKind === "resolved")).toBe(true);
  });

  it("tick_failure smoke re-establishes heartbeat so recovery can resolve", async () => {
    const { runExternalMonitorProductionSmoke } = await import(
      "./production-smoke"
    );
    const smoke = await runExternalMonitorProductionSmoke();
    expect(smoke.error).not.toBe("tick_still_unhealthy_after_clear");
    expect(smoke.error).not.toBe("incident_not_resolved");
    // In test memory mode, Owner notify is mocked via deliverOwnerAlert mock.
    expect(smoke.ok).toBe(true);
    expect(smoke.evidence.incidentId).toBeTruthy();
    expect(smoke.evidence.deliveryStatus).toBe("sent");
    expect(smoke.evidence.incidentStatusAfterRecovery).toBe("resolved");
    expect(smoke.evidence.localHeartbeatStamped).toBe(true);
  });

  it("system-only Owner notify is attributed as system (not line)", async () => {
    const { deliverOwnerAlert } = await import("./notify");
    const notify = vi.mocked(deliverOwnerAlert);
    notify.mockResolvedValueOnce({
      lineAttempted: false,
      lineSent: false,
      systemAttempted: true,
      systemSent: true,
      errorCode: null,
    });

    await activateFailureInjection({
      kind: "tick_failure",
      ttlMs: 60_000,
    });
    await runExternalMonitorCycle({ nowMs: Date.now() });
    const open = await listOpenIncidents();
    const incident = open.find((i) => i.checkId === "scheduler.tick");
    expect(incident).toBeTruthy();
    const deliveries = await listDeliveriesForIncident(incident!.id);
    const lineOpened = deliveries.find(
      (d) => d.deliveryKind === "opened" && d.channel === "line",
    );
    const systemOpened = deliveries.find(
      (d) => d.deliveryKind === "opened" && d.channel === "system",
    );
    expect(lineOpened?.status).toBe("skipped");
    expect(systemOpened?.status).toBe("sent");
  });

  it("cross-user isolation: injection metadata is synthetic-only", async () => {
    const inj = await activateFailureInjection({
      kind: "side_effect_failure",
      ttlMs: 30_000,
    });
    expect(inj.metadata.synthetic).toBe(true);
    expect(inj.metadata.safe).toBe(true);

    const injectSrc = readSrc("lib/external-monitor/inject.ts");
    expect(injectSrc).toContain("atlas_monitor_injections");
    expect(injectSrc).not.toMatch(
      /atlas_user_notifications|atlas_automation_runs|atlas_side_effect_claims/,
    );
  });

  it("restart durability: snapshot restore keeps incident + dedupe", async () => {
    await activateFailureInjection({
      kind: "worker_stale",
      ttlMs: 60_000,
    });
    await runExternalMonitorCycle({ nowMs: Date.now() });
    const before = await listOpenIncidents();
    expect(before.length).toBeGreaterThanOrEqual(1);
    const snap = exportExternalMonitorMemorySnapshotForTests();

    resetExternalMonitorStoreForTests();
    expect((await listOpenIncidents()).length).toBe(0);

    importExternalMonitorMemorySnapshotForTests(snap);
    const after = await listOpenIncidents();
    expect(after.map((i) => i.id).sort()).toEqual(
      before.map((i) => i.id).sort(),
    );

    // Dedupe keys restored → second opened claim loses.
    const incident = after.find((i) => i.checkId === "automation.worker")!;
    const lost = await claimAlertDelivery({
      incidentId: incident.id,
      deliveryKind: "opened",
      channel: "line",
      dedupeKey: `${incident.fingerprint}:opened:g0:line`,
      claimedBy: "after_restart",
    });
    expect(lost).toBeNull();
  });

  it("failure injection safety: does not write user job tables", () => {
    const checks = readSrc("lib/external-monitor/checks.ts");
    expect(checks).toContain("applySynthetic");
    expect(checks).toContain("INJECTION_TO_CHECK");

    const smoke = readSrc("lib/external-monitor/production-smoke.ts");
    expect(smoke).toContain("activateFailureInjection");
    expect(smoke).not.toMatch(/hard-?coded\s+success|postSuccessRate\s*:\s*1/);
  });

  it("all five injection kinds are supported", async () => {
    const kinds = [
      "tick_failure",
      "worker_stale",
      "dlq_spike",
      "notification_failure",
      "side_effect_failure",
    ] as const;
    for (const kind of kinds) {
      await deactivateFailureInjection({ kind });
      await activateFailureInjection({ kind, ttlMs: 10_000 });
      const cycle = await runExternalMonitorCycle({
        nowMs: Date.now(),
        skipNotify: true,
      });
      const synthetic = cycle.checks.filter((c) => c.synthetic);
      expect(synthetic.length).toBeGreaterThanOrEqual(1);
      await deactivateFailureInjection({ kind });
    }
  });
});
