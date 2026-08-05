import { describe, expect, it } from "vitest";

import {
  OPS_PROGRESS_MESSAGES,
  USER_SOFT_RETRY_MESSAGE,
  messageForOpsProgressStage,
} from "./ops-progress";

describe("ops progress (P06)", () => {
  it("exposes required loading stage copy", () => {
    expect(OPS_PROGRESS_MESSAGES.imageAnalyzing).toBe("画像解析中...");
    expect(OPS_PROGRESS_MESSAGES.aiThinking).toBe("AIが考えています...");
    expect(OPS_PROGRESS_MESSAGES.deliverableGenerating).toBe("成果物生成中...");
    expect(OPS_PROGRESS_MESSAGES.saving).toBe("保存しています...");
    expect(OPS_PROGRESS_MESSAGES.completed).toBe("完了しました");
  });

  it("soft retry message bans error screens", () => {
    expect(USER_SOFT_RETRY_MESSAGE).toContain("問題が発生しました");
    expect(USER_SOFT_RETRY_MESSAGE).toContain("自動で再試行しています");
    expect(messageForOpsProgressStage("retrying")).toBe(USER_SOFT_RETRY_MESSAGE);
  });
});
