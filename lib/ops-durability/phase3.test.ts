import { describe, expect, it } from "vitest";

import { runOpsDurabilitySuite } from "@/lib/ops-durability/run-suite";

const FULL = process.env.OPS_DURABILITY_FULL === "1";

describe("ops durability phase3", () => {
  it(
    FULL
      ? "runs full Phase3 suite (500 jobs / 500 notifications / 1000 storage)"
      : "smoke Phase3 (set OPS_DURABILITY_FULL=1 for full)",
    async () => {
      const suite = await runOpsDurabilitySuite({
        jobLimit: FULL ? 500 : 20,
        notificationCount: FULL ? 500 : 20,
        storageCount: FULL ? 1000 : 40,
        concurrentLevels: FULL ? [5, 10, 20, 50, 100] : [5, 10],
      });

      expect(suite.aggregate.jobs.total).toBeGreaterThanOrEqual(FULL ? 500 : 20);
      expect(suite.aggregate.notifications.total).toBeGreaterThanOrEqual(
        FULL ? 500 : 20
      );
      expect(suite.aggregate.storage.total).toBeGreaterThanOrEqual(
        FULL ? 1000 : 40
      );
      expect(suite.env.canRunProductionHttp).toBe(false);
      expect(suite.aggregate.phase3Pass).toBe(false);

      // Storage must not leak across users
      expect(suite.aggregate.storage.permissionLeakCount).toBe(0);

      console.log(
        JSON.stringify({
          suiteId: suite.suiteId,
          reportPath: suite.reportPath,
          phase3Pass: suite.aggregate.phase3Pass,
          jobs: suite.aggregate.jobs,
          notifications: {
            create: suite.aggregate.notifications.createRate,
            push: suite.aggregate.notifications.pushRate,
          },
          storage: {
            upload: suite.aggregate.storage.uploadRate,
            download: suite.aggregate.storage.downloadRate,
          },
          reasons: suite.aggregate.phase3FailReasons,
        })
      );
    },
    FULL ? 2_400_000 : 300_000
  );
});
