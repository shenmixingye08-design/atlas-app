import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { notifyWorkCompleted, notifyWorkFailed } from "./emitters";
import {
  countUnreadUserNotifications,
  listUserNotifications,
  markNotificationRead,
} from "./service";
import { resetNotificationStore } from "./store";
import {
  notifyWorkAccepted,
  notifyWorkLifecycle,
  notifyWorkProcessing,
  notifyWorkTimedOut,
  workJobNotificationRequestId,
} from "./work-lifecycle";

const USER_A = "user_lifecycle_a";
const USER_B = "user_lifecycle_b";

describe("work notification lifecycle", () => {
  beforeEach(() => {
    resetNotificationStore();
  });

  it("shows empty inbox as zero notifications (not a fetch error)", () => {
    expect(listUserNotifications(USER_A)).toHaveLength(0);
    expect(countUnreadUserNotifications(USER_A)).toBe(0);
  });

  it("creates accepted → processing → completed as one upserted row", () => {
    const jobId = "job_lifecycle_1";
    notifyWorkAccepted({ userId: USER_A, jobId, assignment: "Wordで報告書" });
    notifyWorkProcessing({ userId: USER_A, jobId });
    notifyWorkCompleted(USER_A, {
      title: "Wordファイルの準備ができました",
      message: "完了しました",
      requestId: workJobNotificationRequestId(jobId),
      jobId,
      deliverableId: "commander-run_1",
      artifactId: "docx-uuid-1",
      workEvent: "completed",
    });

    const rows = listUserNotifications(USER_A);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.jobId).toBe(jobId);
    expect(rows[0]?.artifactId).toBe("docx-uuid-1");
    expect(rows[0]?.deliverableId).toBe("commander-run_1");
    expect(rows[0]?.workEvent).toBe("completed");
    expect(rows[0]?.type).toBe("completed");
    expect(rows[0]?.actionUrl).toMatch(/^\/results\//);
  });

  it("creates failed notification with retryActionUrl", () => {
    const jobId = "job_fail_1";
    notifyWorkAccepted({ userId: USER_A, jobId });
    notifyWorkFailed(USER_A, {
      title: "Wordの作成に失敗しました",
      message: "安全な範囲で再試行できます。",
      requestId: workJobNotificationRequestId(jobId),
      jobId,
      workEvent: "failed",
      retryActionUrl: "/workspace",
    });

    const row = listUserNotifications(USER_A)[0];
    expect(row?.workEvent).toBe("failed");
    expect(row?.retryActionUrl).toBe("/workspace");
    expect(row?.jobId).toBe(jobId);
    expect(countUnreadUserNotifications(USER_A)).toBe(1);
  });

  it("creates timed_out notification", () => {
    notifyWorkTimedOut({
      userId: USER_A,
      jobId: "job_timeout_1",
    });

    const row = listUserNotifications(USER_A)[0];
    expect(row?.workEvent).toBe("timed_out");
    expect(row?.title).toContain("通常より時間がかかっています");
    expect(row?.message).toContain("処理を終了しました");
    expect(row?.retryActionUrl).toBe("/workspace");
  });

  it("computes unread count and persists mark-as-read", () => {
    notifyWorkCompleted(USER_A, {
      title: "完了",
      message: "完了",
      jobId: "job_read_1",
      requestId: workJobNotificationRequestId("job_read_1"),
      deliverableId: "commander-1",
    });
    notifyWorkFailed(USER_A, {
      title: "失敗",
      message: "失敗",
      jobId: "job_read_2",
      requestId: workJobNotificationRequestId("job_read_2"),
      workEvent: "failed",
    });
    expect(countUnreadUserNotifications(USER_A)).toBe(2);

    const first = listUserNotifications(USER_A)[0]!;
    markNotificationRead(first.notificationId, USER_A);
    expect(countUnreadUserNotifications(USER_A)).toBe(1);
    expect(
      listUserNotifications(USER_A).find(
        (n) => n.notificationId === first.notificationId,
      )?.isRead,
    ).toBe(true);
  });

  it("does not duplicate notifications for the same job event stream", () => {
    const jobId = "job_dedupe_1";
    for (let i = 0; i < 3; i += 1) {
      notifyWorkLifecycle({
        userId: USER_A,
        jobId,
        event: "processing",
        title: "Wordを作成しています",
        message: "完了すると通知でお知らせします",
      });
    }
    notifyWorkCompleted(USER_A, {
      title: "完了",
      message: "完了",
      jobId,
      requestId: workJobNotificationRequestId(jobId),
      deliverableId: "commander-x",
      artifactId: "art-x",
    });
    expect(listUserNotifications(USER_A)).toHaveLength(1);
  });

  it("never shows another user's notifications", () => {
    notifyWorkCompleted(USER_A, {
      title: "A完了",
      message: "A",
      jobId: "job_a",
      requestId: workJobNotificationRequestId("job_a"),
      deliverableId: "commander-a",
    });
    notifyWorkCompleted(USER_B, {
      title: "B完了",
      message: "B",
      jobId: "job_b",
      requestId: workJobNotificationRequestId("job_b"),
      deliverableId: "commander-b",
    });

    const a = listUserNotifications(USER_A);
    const b = listUserNotifications(USER_B);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]?.title).toBe("A完了");
    expect(b[0]?.title).toBe("B完了");
    expect(a[0]?.userId).toBe(USER_A);
  });

  it("keeps jobId so the card can deep-link to work detail / results", () => {
    notifyWorkCompleted(USER_A, {
      title: "完了",
      message: "完了",
      jobId: "job_nav_1",
      requestId: workJobNotificationRequestId("job_nav_1"),
      deliverableId: "commander-nav",
      artifactId: "docx-nav",
    });
    const row = listUserNotifications(USER_A)[0]!;
    expect(row.jobId).toBe("job_nav_1");
    expect(row.artifactId).toBe("docx-nav");
    expect(row.actionUrl).toBe(
      `/results/${encodeURIComponent(row.notificationId)}`,
    );
  });

  it("does not downgrade completed+artifact to failed", () => {
    const jobId = "job_guard_1";
    notifyWorkCompleted(USER_A, {
      title: "完了",
      message: "完了",
      jobId,
      requestId: workJobNotificationRequestId(jobId),
      deliverableId: "commander-ok",
      artifactId: "docx-ok",
    });
    notifyWorkFailed(USER_A, {
      title: "失敗にしたい",
      message: "側道の失敗",
      jobId,
      requestId: workJobNotificationRequestId(jobId),
      workEvent: "failed",
    });
    const row = listUserNotifications(USER_A)[0]!;
    expect(row.type).toBe("completed");
    expect(row.workEvent).toBe("completed");
  });
});
