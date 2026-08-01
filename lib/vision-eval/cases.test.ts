import { describe, expect, it } from "vitest";

import {
  assertVisionEvalCaseCounts,
  VISION_EVAL_CASES,
} from "@/lib/vision-eval/cases";
import { generateVisionEvalImages } from "@/lib/vision-eval/generate-images";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("vision eval cases", () => {
  it("has 100 unique cases with required category counts", () => {
    expect(VISION_EVAL_CASES.length).toBe(100);
    assertVisionEvalCaseCounts();
    const ids = new Set(VISION_EVAL_CASES.map((c) => c.caseId));
    expect(ids.size).toBe(100);
    const seeds = new Set(
      VISION_EVAL_CASES.map((c) => c.seed.lines.join("|") + c.caseId)
    );
    expect(seeds.size).toBe(100);
  });

  it("generates unique image bytes (no clone padding)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vision-eval-"));
    const subset = VISION_EVAL_CASES.slice(0, 20);
    const images = await generateVisionEvalImages(subset, dir);
    expect(images.length).toBe(20);
    const hashes = new Set(images.map((i) => i.sha256));
    expect(hashes.size).toBe(20);
  }, 60_000);
});
