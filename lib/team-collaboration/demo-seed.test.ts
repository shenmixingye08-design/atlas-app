import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getEmployeeTeamStatsSnapshot,
  resetEmployeeTeamTelemetryForTests,
  seedDemoEmployeeStats,
} from "./telemetry";

describe("seedDemoEmployeeStats", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEmployeeTeamTelemetryForTests();
  });

  it("does not inject demo rows in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    seedDemoEmployeeStats();
    expect(getEmployeeTeamStatsSnapshot().employees).toEqual([]);
    expect(getEmployeeTeamStatsSnapshot().totalRuns).toBe(0);
  });

  it("may seed outside production for local inspection", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "test");
    seedDemoEmployeeStats();
    expect(getEmployeeTeamStatsSnapshot().totalRuns).toBeGreaterThan(0);
  });
});
