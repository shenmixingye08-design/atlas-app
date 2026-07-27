import { describe, expect, it } from "vitest";

import {
  buildFailureMessage,
  buildFailureTitle,
} from "@/lib/notifications/job-progress";

describe("job progress failure copy", () => {
  it("never uses banned generic failure phrase", () => {
    const title = buildFailureTitle({ jobName: "契約書", step: "word" });
    const message = buildFailureMessage({
      jobName: "契約書",
      step: "word",
      failureClass: "timeout",
      failureReason: "AI応答タイムアウト",
      retryCount: 1,
      maxRetries: 3,
      retrying: true,
    });

    expect(title).toContain("エラーが発生しました");
    expect(title).not.toContain("処理を完了できませんでした");
    expect(message).toContain("再試行回数 1 / 3");
    expect(message).toContain("AI応答タイムアウト");
    expect(message).toContain("現在AIが自動で再試行しています");
    expect(message).not.toContain("処理を完了できませんでした");
    expect(message).not.toContain("処理できませんでした");
  });
});
