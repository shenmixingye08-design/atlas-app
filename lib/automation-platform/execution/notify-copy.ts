/**
 * User-facing copy for V2 automation run lifecycle notifications.
 * Capability labels only — never internal status enums.
 */

import { sanitizeUserFacingDetail } from "@/lib/notifications/user-facing-copy";
import type { AutomationRun } from "@/lib/automation-platform/types/run";

export type RunNotificationEvent =
  | "started"
  | "awaiting_approval"
  | "needs_input"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "retry_started"
  | "retry_finished"
  | "prepared";

const CAPABILITY_COPY: Record<string, { done: string; fail: string }> = {
  x_post: {
    done: "Xへの投稿が完了しました",
    fail: "X投稿に失敗しました",
  },
  wordpress: {
    done: "WordPressへの公開が完了しました",
    fail: "WordPressへの公開に失敗しました",
  },
  google_calendar: {
    done: "カレンダーへの登録が完了しました",
    fail: "カレンダーへの登録に失敗しました",
  },
  gmail: {
    done: "メールの送信が完了しました",
    fail: "メールの送信に失敗しました",
  },
  excel_generate: {
    done: "Excelファイルが完成しました",
    fail: "Excelファイルを作成できませんでした",
  },
  word_generate: {
    done: "Wordファイルが完成しました",
    fail: "Wordファイルを作成できませんでした",
  },
  pdf_generate: {
    done: "PDFが完成しました",
    fail: "PDFを作成できませんでした",
  },
  powerpoint_generate: {
    done: "PowerPointが完成しました",
    fail: "PowerPointを作成できませんでした",
  },
  deliverable_generate: {
    done: "成果物が完成しました",
    fail: "成果物を作成できませんでした",
  },
  dropbox: {
    done: "Dropboxへの保存が完了しました",
    fail: "Dropboxへの保存に失敗しました",
  },
};

function primaryCapabilityId(run: AutomationRun | null | undefined): string | null {
  const steps = run?.steps ?? [];
  const failed = steps.find((step) => step.status === "failed");
  if (failed?.capabilityId) return failed.capabilityId;
  const succeeded = [...steps]
    .reverse()
    .find(
      (step) =>
        step.status === "succeeded" &&
        step.capabilityId !== "await_approval" &&
        step.capabilityId !== "wait" &&
        step.capabilityId !== "condition" &&
        step.capabilityId !== "notify",
    );
  return succeeded?.capabilityId ?? steps[0]?.capabilityId ?? null;
}

export function buildAutomationRunNotifyCopy(input: {
  event: RunNotificationEvent;
  automationName: string;
  run?: AutomationRun | null;
  detail?: string | null;
}): { title: string; message: string } {
  const name = input.automationName.trim() || "自動化";
  const capability = primaryCapabilityId(input.run);
  const capabilityCopy = capability ? CAPABILITY_COPY[capability] : undefined;
  const extra = sanitizeUserFacingDetail(input.detail);

  switch (input.event) {
    case "awaiting_approval":
      return {
        title: "実行前の確認が必要です",
        message: `「${name}」の内容をご確認ください。承認すると実行できます。`,
      };
    case "needs_input":
      return {
        title: "MINERVOTが追加情報を待っています",
        message: `「${name}」の続行に、必要な内容をご提供ください。`,
      };
    case "prepared":
      return {
        title: "実行前の確認が必要です",
        message: `「${name}」の準備が整いました。内容をご確認ください。`,
      };
    case "succeeded":
    case "retry_finished":
      return {
        title: capabilityCopy?.done ?? `「${name}」が完了しました`,
        message: extra
          ? `お待たせいたしました。「${name}」が完了しました。${extra}`
          : `お待たせいたしました。「${name}」が完了しました。内容をご確認ください。`,
      };
    case "partially_succeeded":
      return {
        title: "一部完了しました。確認が必要です",
        message: `「${name}」は一部完了しました。内容をご確認ください。`,
      };
    case "failed":
      return {
        title: capabilityCopy?.fail ?? `「${name}」に失敗しました`,
        message: extra
          ? `「${name}」に失敗しました。${extra}内容を確認すると再実行できます。`
          : `「${name}」に失敗しました。内容を確認すると再実行できます。`,
      };
    case "started":
      return {
        title: "自動化を開始しました",
        message: `「${name}」の実行を開始しました。`,
      };
    case "retry_started":
      return {
        title: "自動化を再試行します",
        message: `「${name}」を再試行します。`,
      };
    default:
      return {
        title: `「${name}」のお知らせ`,
        message: `「${name}」についてご確認ください。`,
      };
  }
}
