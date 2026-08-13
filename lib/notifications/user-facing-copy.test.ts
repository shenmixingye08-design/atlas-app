import { describe, expect, it } from "vitest";

import {
  artifactCompletedCopy,
  looksLikeInternalCode,
  sanitizeUserFacingDetail,
} from "./user-facing-copy";

describe("user-facing notification copy", () => {
  it("A: artifact complete copy", () => {
    expect(artifactCompletedCopy("excel", "売上.xlsx").title).toBe(
      "Excelファイルが完成しました",
    );
    expect(artifactCompletedCopy("word").title).toBe("Wordファイルが完成しました");
    expect(artifactCompletedCopy("pdf").title).toBe("PDFが完成しました");
    expect(artifactCompletedCopy("powerpoint").title).toBe(
      "PowerPointが完成しました",
    );
  });

  it("strips internal status tokens from user copy", () => {
    expect(looksLikeInternalCode("automation_run_failed")).toBe(true);
    expect(looksLikeInternalCode("step execution error")).toBe(true);
    expect(sanitizeUserFacingDetail("automation_run_failed")).toBeNull();
    expect(sanitizeUserFacingDetail("内容をご確認ください")).toBe(
      "内容をご確認ください",
    );
  });
});
