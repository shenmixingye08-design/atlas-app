import { describe, expect, it } from "vitest";

import {
  deriveTaskTypeTitle,
  formatNoticeMessage,
  formatNoticeTitle,
  isSafeActionUrl,
  matchesNoticeFilter,
  resolveNoticeActionUrl,
  resolveNoticeCategory,
  resolveNoticePriority,
} from "./display";
import type { NotificationRecord } from "./types";

function sample(
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord {
  return {
    notificationId: "ntf_1",
    userId: "user_1",
    audience: "user",
    type: "completed",
    title: "完了",
    message: "作業が終わりました",
    relatedTaskId: null,
    relatedService: null,
    isRead: false,
    createdAt: new Date().toISOString(),
    actionUrl: "/workspace",
    ...overrides,
  };
}

describe("notification display", () => {
  it("maps types to secretary categories", () => {
    expect(resolveNoticeCategory(sample({ type: "awaiting_review" }))).toBe(
      "needs_review",
    );
    expect(resolveNoticeCategory(sample({ type: "recommendation" }))).toBe(
      "improvement",
    );
    expect(resolveNoticeCategory(sample({ type: "billing" }))).toBe("ops");
    expect(
      resolveNoticeCategory(
        sample({
          type: "completed",
          message: "追加の資料をご提供ください",
        }),
      ),
    ).toBe("needs_material");
  });

  it("keeps urgent priority rare", () => {
    expect(
      resolveNoticePriority(
        sample({
          type: "error",
          title: "失敗",
          message: "処理を完了できませんでした",
        }),
      ),
    ).toBe("urgent");
    expect(
      resolveNoticePriority(sample({ type: "completed" })),
    ).toBe("normal");
  });

  it("formats secretary tone titles", () => {
    expect(
      formatNoticeTitle(sample({ type: "awaiting_review" })),
    ).toContain("ご確認");
    expect(formatNoticeMessage(sample({ type: "error" }))).toContain(
      "ご確認ください",
    );
  });

  it("derives task-type-specific completed titles (not the generic one)", () => {
    // X auto-post → clear, service-based title.
    expect(
      formatNoticeTitle(
        sample({
          type: "completed",
          title: "お仕事が完了しました",
          message: "投稿が完了しました。",
          relatedService: "x",
        }),
      ),
    ).toBe("X自動投稿が完了しました");

    // Contract summary derived from deliverable kind keyword.
    expect(
      formatNoticeTitle(
        sample({
          type: "completed",
          title: "お仕事が完了しました",
          message: "「契約書」の要約が完了しました。",
        }),
      ),
    ).toBe("契約書の要約が完了しました");

    // 家計簿 / receipt logging.
    expect(
      formatNoticeTitle(
        sample({
          type: "completed",
          title: "お仕事が完了しました",
          message: "レシートを読み取り、家計簿へ登録しました。",
        }),
      ),
    ).toBe("家計簿へ登録しました");

    // Blog article creation.
    expect(
      formatNoticeTitle(
        sample({
          type: "completed",
          title: "お仕事が完了しました",
          message: "ご依頼のブログ記事を作成しました。",
        }),
      ),
    ).toBe("ブログ記事を作成しました");

    // Image analysis (loose keyword match, e.g.「画像の解析」).
    expect(
      formatNoticeTitle(
        sample({
          type: "completed",
          title: "お仕事が完了しました",
          message: "アップロードされた画像の解析が完了しました。",
        }),
      ),
    ).toBe("画像解析が完了しました");
  });

  it("never leaks internal orchestrator titles", () => {
    // Generic completed with no signal → secretary default, not the stored
    // internal title.
    expect(
      formatNoticeTitle(
        sample({
          type: "completed",
          title: "AIオーケストレーター完了報告",
          message: "処理が完了しました。",
        }),
      ),
    ).toBe("お仕事が完了しました");
  });

  it("does not claim success when a completed row's body failed", () => {
    // Partial SNS run stored as completed but body says failed.
    expect(
      deriveTaskTypeTitle(
        sample({
          type: "completed",
          title: "お仕事が完了しました",
          message: "投稿文は準備できましたが、Xへの投稿に失敗しました。",
          relatedService: "x",
        }),
      ),
    ).toBeNull();
  });

  it("derives task-type failed titles for errors", () => {
    expect(
      formatNoticeTitle(
        sample({
          type: "error",
          title: "処理を完了できませんでした",
          message: "処理を完了できませんでした。契約書の読み取りに失敗しました。",
        }),
      ),
    ).toBe("契約書の処理を完了できませんでした");
  });

  it("preserves a specific stored title when no derivation applies", () => {
    expect(
      formatNoticeTitle(
        sample({
          type: "automation",
          title: "メールを受信しました",
          message: "新着メールがあります。",
        }),
      ),
    ).toBe("メールを受信しました");
  });

  it("routes a resolvable result target through the unified /results route", () => {
    // A deliverable target → the self-resolving results page (not a stale
    // /projects deep link that can dead-end).
    expect(
      resolveNoticeActionUrl(
        sample({ actionUrl: null, deliverableId: "commander-run_1" }),
      ),
    ).toBe("/results/ntf_1");

    // Even a stale /projects actionUrl is upgraded to /results when a target id
    // is present (legacy rows self-heal).
    expect(
      resolveNoticeActionUrl(
        sample({ actionUrl: "/projects/commander-run_1", deliverableId: "commander-run_1" }),
      ),
    ).toBe("/results/ntf_1");

    // An already-canonical /results link is preserved as-is.
    expect(
      resolveNoticeActionUrl(
        sample({ actionUrl: "/results/ntf_1", targetType: "deliverable", targetId: "commander-run_1" }),
      ),
    ).toBe("/results/ntf_1");

    // Unsafe stored actionUrl, automation-only → keep the working panel link.
    expect(
      resolveNoticeActionUrl(
        sample({
          actionUrl: "/owner/secret",
          deliverableId: null,
          relatedTaskId: null,
          automationId: "auto_9",
        }),
      ),
    ).toBe("/automations?id=auto_9");

    // A safe explicit actionUrl with no result target is preserved.
    expect(
      resolveNoticeActionUrl(sample({ actionUrl: "/workspace/x?historyId=h1" })),
    ).toBe("/workspace/x?historyId=h1");
  });

  it("blocks unsafe action urls", () => {
    expect(isSafeActionUrl("/workspace")).toBe(true);
    expect(isSafeActionUrl("/owner/system-status")).toBe(false);
    expect(isSafeActionUrl("https://evil.example")).toBe(false);
  });

  it("filters unread and categories", () => {
    const unread = sample({ isRead: false, type: "error" });
    expect(matchesNoticeFilter(unread, "unread")).toBe(true);
    expect(matchesNoticeFilter(unread, "error")).toBe(true);
    expect(matchesNoticeFilter(unread, "completed")).toBe(false);
  });
});
