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
    expect(WORD_JOB_UI_COPY.accepted.title).toBe("かしこまりました。");
    expect(WORD_JOB_UI_COPY.accepted.description).toContain(
      "ご依頼を受け付けました",
    );
    expect(WORD_JOB_UI_COPY.accepted.description).toContain(
      "成果物が完成しましたら通知いたします",
    );
    expect(WORD_JOB_UI_COPY.processing.description).toContain(
      "完了すると通知でお知らせします",
    );
    expect(WORD_JOB_UI_COPY.completed.title).toBe("成果物が完成しました。");
    expect(WORD_JOB_UI_COPY.completed.primaryAction).toBe("成果物を開く");
    expect(WORD_JOB_UI_COPY.completed.secondaryAction).toBe("ダウンロード");
    expect(WORD_JOB_UI_COPY.failed.title).toBe("申し訳ありません。");
    expect(WORD_JOB_UI_COPY.failed.description).toContain("再試行できます");
    expect(WORD_JOB_UI_COPY.failed.primaryAction).toBe("もう一度試す");
    expect(WORD_JOB_UI_COPY.failed.secondaryAction).toBe("詳細を見る");
    expect(WORD_JOB_UI_COPY.timed_out.title).toContain("通常より時間がかかっています");
    expect(WORD_JOB_UI_COPY.timed_out.description).toContain("処理を終了しました");
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
