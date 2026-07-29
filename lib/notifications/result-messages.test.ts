import { describe, expect, it } from "vitest";

import {
  RESULT_MESSAGES,
  RESULT_TITLES,
  resultMessage,
  resultTitle,
  type ResultResolutionCode,
} from "./result-messages";

describe("result-messages cause codes", () => {
  const required: ResultResolutionCode[] = [
    "pending",
    "deliverable",
    "ai_error",
    "storage_failed",
    "notification_failed",
    "timeout",
    "generation_failed",
  ];

  it("exposes user-facing titles for 生成中/完了/保存失敗/AI/Timeout/通知失敗", () => {
    expect(resultTitle("pending")).toBe("Wordを作成しています");
    expect(resultTitle("deliverable")).toBe("生成完了");
    expect(resultTitle("storage_failed")).toBe("保存失敗");
    expect(resultTitle("ai_error")).toBe("AIエラー");
    expect(resultTitle("timeout")).toBe("タイムアウト");
    expect(resultTitle("notification_failed")).toBe("通知失敗");
    expect(resultTitle("generation_failed")).toBe("Wordの作成に失敗しました");
  });

  it("never uses the banned generic-only「成果物が見つかりません」copy", () => {
    for (const code of Object.keys(RESULT_MESSAGES) as ResultResolutionCode[]) {
      expect(RESULT_MESSAGES[code]).not.toBe("成果物が見つかりません");
      expect(RESULT_TITLES[code] ?? "").not.toBe("成果物が見つかりません");
    }
  });

  it("has messages for every required cause code", () => {
    for (const code of required) {
      expect(resultMessage(code).length).toBeGreaterThan(8);
    }
  });
});
