import { describe, expect, it } from "vitest";

import { buildPushCopy } from "@/lib/push/templates";

describe("buildPushCopy", () => {
  it("uses auto-recovered template", () => {
    const copy = buildPushCopy({
      type: "completed",
      title: "",
      message: "",
      eventCategory: "auto_recovered",
      jobName: "週次レポート",
      autoRecovered: true,
    });
    expect(copy.title).toBe("自動復旧しました");
    expect(copy.body).toContain("週次レポート");
  });

  it("uses failure template", () => {
    const copy = buildPushCopy({
      type: "error",
      title: "x",
      message: "y",
      eventCategory: "final_failure",
    });
    expect(copy.title).toBe("処理を完了できませんでした");
  });
});
