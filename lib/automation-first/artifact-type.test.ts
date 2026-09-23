import { describe, expect, it } from "vitest";

import { artifactFileTypeFromLabel } from "./artifact-type";

describe("artifactFileTypeFromLabel", () => {
  it("maps office and pdf extensions", () => {
    expect(artifactFileTypeFromLabel("週次レポート.xlsx")).toBe("xlsx");
    expect(artifactFileTypeFromLabel("提案書.DOCX")).toBe("docx");
    expect(artifactFileTypeFromLabel("資料.pptx")).toBe("pptx");
    expect(artifactFileTypeFromLabel("請求書.pdf ")).toBe("pdf");
    expect(artifactFileTypeFromLabel("data.csv")).toBe("xlsx");
  });

  it("falls back to other for posts and unknown labels", () => {
    expect(artifactFileTypeFromLabel("X投稿")).toBe("other");
    expect(artifactFileTypeFromLabel("image.png")).toBe("other");
    expect(artifactFileTypeFromLabel(null)).toBe("other");
  });
});
