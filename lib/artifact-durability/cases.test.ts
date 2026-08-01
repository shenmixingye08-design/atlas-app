import { describe, expect, it } from "vitest";

import {
  ARTIFACT_DURABILITY_CASES,
  assertArtifactCaseCounts,
} from "@/lib/artifact-durability/cases";

describe("artifact durability cases", () => {
  it("has 400 unique cases (100 per format)", () => {
    expect(ARTIFACT_DURABILITY_CASES.length).toBe(400);
    assertArtifactCaseCounts();
    const by = (f: string) =>
      ARTIFACT_DURABILITY_CASES.filter((c) => c.format === f).length;
    expect(by("docx")).toBe(100);
    expect(by("xlsx")).toBe(100);
    expect(by("pdf")).toBe(100);
    expect(by("pptx")).toBe(100);
    expect(new Set(ARTIFACT_DURABILITY_CASES.map((c) => c.content)).size).toBe(
      400
    );
  });
});
