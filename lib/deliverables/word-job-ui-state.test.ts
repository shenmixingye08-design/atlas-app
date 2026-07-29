import { describe, expect, it } from "vitest";

import {
  WORD_JOB_UI_COPY,
  mapWorkJobStatusToWordUiPhase,
  sanitizeWordFailureDetail,
} from "./word-job-ui-state";

describe("word job UI state", () => {
  it("maps work-job statuses without confusing empties", () => {
    expect(mapWorkJobStatusToWordUiPhase({ status: "queued" })).toBe("accepted");
    expect(mapWorkJobStatusToWordUiPhase({ status: "processing" })).toBe(
      "processing",
    );
    expect(mapWorkJobStatusToWordUiPhase({ status: "running" })).toBe(
      "processing",
    );
    expect(mapWorkJobStatusToWordUiPhase({ status: "completed" })).toBe(
      "completed",
    );
    expect(mapWorkJobStatusToWordUiPhase({ status: "failed" })).toBe("failed");
    expect(mapWorkJobStatusToWordUiPhase({ status: "timed_out" })).toBe(
      "timed_out",
    );
    expect(
      mapWorkJobStatusToWordUiPhase({ status: null, networkError: true }),
    ).toBe("network_error");
    expect(
      mapWorkJobStatusToWordUiPhase({
        status: "processing",
        blockReason: "awaiting_confirmation",
      }),
    ).toBeNull();
  });

  it("exposes the required mobile copy for every phase", () => {
    expect(WORD_JOB_UI_COPY.accepted.title).toBe("Word作成を受け付けました。");
    expect(WORD_JOB_UI_COPY.processing.title).toBe("Wordを作成しています。");
    expect(WORD_JOB_UI_COPY.processing.description).toBe(
      "完了すると通知でお知らせします。",
    );
    expect(WORD_JOB_UI_COPY.completed.primaryAction).toBe("Wordを開く");
    expect(WORD_JOB_UI_COPY.completed.secondaryAction).toBe("ダウンロード");
    expect(WORD_JOB_UI_COPY.failed.primaryAction).toBe("もう一度試す");
    expect(WORD_JOB_UI_COPY.failed.secondaryAction).toBe("詳細を見る");
    expect(WORD_JOB_UI_COPY.timed_out.title).toContain("処理時間を超え");
    expect(WORD_JOB_UI_COPY.network_error.primaryAction).toBe("再読み込み");
  });

  it("never leaves failed with an empty detail", () => {
    expect(sanitizeWordFailureDetail(null)).toBeTruthy();
    expect(sanitizeWordFailureDetail("ECONNREFUSED at /internal")).toMatch(
      /もう一度|詳細/,
    );
    expect(sanitizeWordFailureDetail("文書の保存に失敗しました")).toContain(
      "保存",
    );
  });
});
