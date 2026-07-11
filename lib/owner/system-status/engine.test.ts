import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordOwnerError, resetErrorMonitoringStore } from "@/lib/owner/error-monitoring/store";

import { buildSystemStatusSnapshot } from "./engine";
import {
  recordHealthProbe,
  resetSystemStatusStore,
  setSystemServiceStatusOverride,
} from "./store";

describe("system status engine", () => {
  beforeEach(() => {
    resetSystemStatusStore();
    resetErrorMonitoringStore();
  });

  afterEach(() => {
    resetSystemStatusStore();
    resetErrorMonitoringStore();
  });

  it("returns estimated operational metrics when no live probes exist", () => {
    const snapshot = buildSystemStatusSnapshot(
      new Date("2026-07-08T12:00:00.000Z"),
    );

    expect(snapshot.services).toHaveLength(8);
    expect(snapshot.operationalCount).toBe(8);
    expect(snapshot.services[0]?.status).toBe("operational");
    expect(snapshot.services[0]?.uptimePercent).toBeGreaterThan(99);
    expect(snapshot.services[0]?.isEstimated).toBe(true);
  });

  it("marks services as outage when unresolved errors exist", () => {
    recordOwnerError({
      categoryId: "openai",
      message: "API timeout",
      timestamp: "2026-07-08T10:00:00.000Z",
    });

    const snapshot = buildSystemStatusSnapshot(new Date("2026-07-08T12:00:00.000Z"));
    const openai = snapshot.services.find((service) => service.serviceId === "openai");

    expect(openai?.status).toBe("outage");
    expect(snapshot.issueCount).toBeGreaterThan(0);
  });

  it("computes uptime from health probes", () => {
    recordHealthProbe({
      serviceId: "stripe",
      success: true,
      timestamp: "2026-07-08T10:00:00.000Z",
    });
    recordHealthProbe({
      serviceId: "stripe",
      success: false,
      timestamp: "2026-07-08T11:00:00.000Z",
    });

    const snapshot = buildSystemStatusSnapshot(new Date("2026-07-08T12:00:00.000Z"));
    const stripe = snapshot.services.find((service) => service.serviceId === "stripe");

    expect(stripe?.uptimePercent).toBe(50);
    expect(stripe?.isEstimated).toBe(false);
  });

  it("respects manual maintenance overrides", () => {
    setSystemServiceStatusOverride("server", "maintenance");

    const snapshot = buildSystemStatusSnapshot();
    const server = snapshot.services.find((service) => service.serviceId === "server");

    expect(server?.status).toBe("maintenance");
    expect(server?.isManualOverride).toBe(true);
  });
});
