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

/** Rule-based push copy — no OpenAI. Never use banned generic failure text. */
export function buildPushCopy(input: TemplateInput): {
  title: string;
  body: string;
} {
  const job = input.jobName?.trim() || null;
  const title = input.title?.includes("処理を完了できませんでした")
    ? job
      ? `「${job}」の処理中にエラーが発生しました`
      : "処理中にエラーが発生しました"
    : input.title;
  const body = (input.message || "")
    .replace(/処理を完了できませんでした[。.]?/g, "")
    .replace(/処理できませんでした[。.]?/g, "")
    .trim();

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
        title: title || "仕事が完了しました",
        body:
          body ||
          (job
            ? `「${job}」が完了しました。プレビュー・ダウンロードがご利用いただけます。`
            : "処理が完了しました。プレビュー・ダウンロードがご利用いただけます。"),
      };
    case "final_failure":
      return {
        title:
          title && !title.includes("処理を完了できませんでした")
            ? title
            : job
              ? `「${job}」の処理中にエラーが発生しました`
              : "処理中にエラーが発生しました",
        body:
          body ||
          (job
            ? `「${job}」の処理中にエラーが発生しました。原因と次の対応をご確認ください。`
            : "処理中にエラーが発生しました。原因と次の対応をご確認ください。"),
      };
    case "approval_needed":
      return {
        title: "ご確認が必要です",
        body:
          body ||
          (job
            ? `「${job}」について、ご確認をお願いいたします。`
            : "ご確認をお願いいたします。"),
      };
    case "connection_broken":
      return {
        title: "連携に問題があります",
        body: body || "外部サービスとの連携をご確認ください。",
      };
    case "daily_report":
      return {
        title: title || "本日のまとめ",
        body: body || "本日の仕事のまとめをご用意しました。",
      };
    default:
      return {
        title: title || input.title,
        body: body || input.message,
      };
  }
}
