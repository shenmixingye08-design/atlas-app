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

  it("uses failure template without banned generic copy", () => {
    const copy = buildPushCopy({
      type: "error",
      title: "処理を完了できませんでした",
      message: "処理を完了できませんでした。内容をご確認ください。",
      eventCategory: "final_failure",
      jobName: "契約書",
    });
    expect(copy.title).toContain("エラーが発生しました");
    expect(copy.title).not.toBe("処理を完了できませんでした");
    expect(copy.body).not.toContain("処理を完了できませんでした");
  });
});
