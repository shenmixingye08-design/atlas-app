import type { NotificationType } from "@/lib/notifications/types";

import type { PushEventCategory } from "./types";

type TemplateInput = {
  type: NotificationType;
  title: string;
  message: string;
  eventCategory: PushEventCategory;
  jobName?: string | null;
  autoRecovered?: boolean;
};

/** Rule-based push copy — no OpenAI. */
export function buildPushCopy(input: TemplateInput): {
  title: string;
  body: string;
} {
  const job = input.jobName?.trim() || null;

  if (input.autoRecovered || input.eventCategory === "auto_recovered") {
    return {
      title: "自動復旧しました",
      body: job
        ? `「${job}」が自動復旧し、正常に完了しました。`
        : "処理が自動復旧し、正常に完了しました。",
    };
  }

  switch (input.eventCategory) {
    case "final_success":
      return {
        title: input.title || "仕事が完了しました",
        body: input.message || (job ? `「${job}」が完了しました。` : "処理が完了しました。"),
      };
    case "final_failure":
      return {
        title: "処理を完了できませんでした",
        body:
          input.message ||
          (job
            ? `「${job}」の処理を完了できませんでした。内容をご確認ください。`
            : "処理を完了できませんでした。内容をご確認ください。"),
      };
    case "approval_needed":
      return {
        title: "ご確認が必要です",
        body:
          input.message ||
          (job ? `「${job}」について、ご確認をお願いいたします。` : "ご確認をお願いいたします。"),
      };
    case "connection_broken":
      return {
        title: "連携に問題があります",
        body: input.message || "外部サービスとの連携をご確認ください。",
      };
    case "daily_report":
      return {
        title: input.title || "本日のまとめ",
        body: input.message || "本日の仕事のまとめをご用意しました。",
      };
    default:
      return {
        title: input.title,
        body: input.message,
      };
  }
}
