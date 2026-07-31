import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

describe("nps store", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "launch-nps-"));
    process.env.LAUNCH_VERDICT_DATA_DIR = dir;
  });

  afterEach(() => {
    delete process.env.LAUNCH_VERDICT_DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("computes NPS from promoters and detractors", async () => {
    const { computeNps, recordNpsResponse, getNpsSnapshot, resetNpsStoreForTests } =
      await import("@/lib/owner/launch-verdict/nps-store");
    resetNpsStoreForTests();
    // 10 promoters, 0 detractors → 100
    expect(computeNps([10, 10, 9, 9]).nps).toBe(100);
    // 1 promoter, 1 detractor, 2 passive → (25-25)=0
    expect(computeNps([10, 0, 7, 8]).nps).toBe(0);

    for (const score of [10, 10, 10, 9, 9, 9, 8, 7, 6, 5]) {
      recordNpsResponse({ score });
    }
    const snap = getNpsSnapshot();
    expect(snap.sampleSize).toBe(10);
    // promoters 6, detractors 2 → (60-20)=40
    expect(snap.nps).toBe(40);
  });
});
