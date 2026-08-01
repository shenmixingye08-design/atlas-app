import type { CapabilityPublishDecision } from "./types";

/**
 * GA条件未達の機能は GA公開にしない。
 * ローカル耐久がある成果物系は招待制/βに留め、Vision・外部・Emailは非表示/停止。
 */
export function decidePublishScope(): CapabilityPublishDecision[] {
  const hide = (id: CapabilityPublishDecision["id"], reason: string) =>
    ({
      id,
      scope: "非表示" as const,
      reason,
      gaReady: false,
    }) satisfies CapabilityPublishDecision;

  const invite = (id: CapabilityPublishDecision["id"], reason: string) =>
    ({
      id,
      scope: "招待制" as const,
      reason,
      gaReady: false,
    }) satisfies CapabilityPublishDecision;

  const beta = (id: CapabilityPublishDecision["id"], reason: string) =>
    ({
      id,
      scope: "β公開" as const,
      reason,
      gaReady: false,
    }) satisfies CapabilityPublishDecision;

  const pause = (id: CapabilityPublishDecision["id"], reason: string) =>
    ({
      id,
      scope: "一時停止" as const,
      reason,
      gaReady: false,
    }) satisfies CapabilityPublishDecision;

  return [
    invite("word", "ローカル耐久あり・本番E2E未達"),
    invite("excel", "ローカル耐久あり・本番E2E未達"),
    invite("pdf", "ローカル耐久あり・本番E2E未達"),
    invite("powerpoint", "ローカル耐久あり・本番E2E未達"),
    hide("csv", "専用生成未実装。変換のみ"),
    pause("vision", "本番Vision成功率未証明"),
    pause("ocr", "Vision依存・未証明"),
    pause("image_to_excel", "Vision未証明"),
    pause("image_to_word", "Vision未証明"),
    pause("image_to_pdf", "Vision未証明"),
    invite("convert", "lossy変換。本番未証明"),
    invite("revise", "再編集UIあり・本番未証明"),
    invite("revision", "版管理あり・本番未証明"),
    hide("x_post", "外部E2E未接続。Lightは自動投稿不可"),
    hide("gmail", "Standard+かつ未検証"),
    hide("gcal", "Standard+かつ未検証"),
    hide("wordpress", "未検証"),
    hide("dropbox", "未検証"),
    beta("automation", "cron制約・本番未証明。βのみ"),
    hide("push", "VAPID未検証"),
    hide("email_notify", "チャネル未実装"),
    invite("signup", "公開範囲を招待制に限定するまで停止推奨"),
    invite("billing", "本番課金E2E未実施"),
    invite("new_jobs", "招待ユーザーのみ受付"),
  ];
}

export function gaCapabilities(
  decisions = decidePublishScope()
): CapabilityPublishDecision[] {
  return decisions.filter((d) => d.scope === "GA公開");
}

export function hiddenOrPaused(
  decisions = decidePublishScope()
): CapabilityPublishDecision[] {
  return decisions.filter(
    (d) =>
      d.scope === "非表示" ||
      d.scope === "一時停止" ||
      d.scope === "未公開"
  );
}
