import { describe, expect, it } from "vitest";

import {
  computeSampleSavedMinutes,
  creationSecFromMs,
  formatProofDurationFromMs,
  formatProofSavedMinutes,
} from "./proof-samples";
import {
  getProofDisclaimer,
  getProofFileSamples,
  getProofTextSamples,
} from "./proof-catalog";

describe("landing proof samples", () => {
  it("formats measured durations without inventing values", () => {
    expect(formatProofDurationFromMs(51)).toBe("51ミリ秒");
    expect(formatProofDurationFromMs(1870)).toBe("1.9秒");
    expect(formatProofSavedMinutes(14.9)).toBe("約14.9分");
  });

  it("computes sample saved minutes from typical baseline only", () => {
    expect(computeSampleSavedMinutes(15, 0.2)).toBe(15);
    expect(computeSampleSavedMinutes(15, 45)).toBe(14.3);
    expect(creationSecFromMs(187)).toBe(0.2);
  });

  it("loads manifest-backed proof catalog with sample disclaimer", () => {
    expect(getProofDisclaimer()).toContain("見本");
    const texts = getProofTextSamples();
    expect(texts).toHaveLength(2);
    expect(texts[0]?.creationMs).toBeGreaterThan(0);
    expect(texts[0]?.usedAi).toContain("MINERVOT");
    const files = getProofFileSamples();
    expect(files.map((f) => f.kind).sort()).toEqual(["docx", "pdf", "pptx", "xlsx"]);
    for (const file of files) {
      expect(file.href.startsWith("/samples/")).toBe(true);
      expect(file.creationMs).toBeGreaterThan(0);
    }
  });
});
