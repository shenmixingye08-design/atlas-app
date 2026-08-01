import { beforeEach, describe, expect, it, vi } from "vitest";

const notifyWorkFailed = vi.fn();

vi.mock("@/lib/notifications/emitters", () => ({
  notifyWorkFailed: (...args: unknown[]) => notifyWorkFailed(...args),
}));

describe("notifyWorkJobFailed", () => {
  beforeEach(() => {
    notifyWorkFailed.mockReset();
  });

  it("emits a failure notification with job deep-link context", async () => {
    const { notifyWorkJobFailed } = await import("./notify-failure");
    notifyWorkJobFailed({
      userId: "user_1",
      jobId: "job_abc",
      message: "画像の解析に失敗しました",
      title: "画像の確認が必要です",
    });
    expect(notifyWorkFailed).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        requestId: "job_abc",
        relatedTaskId: "job_abc",
        actionUrl: "/notifications",
        title: "画像の確認が必要です",
      }),
    );
  });
});
