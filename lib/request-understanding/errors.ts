import type { RequestUserErrorCode } from "./types";

export function userMessageForRequestCode(code: RequestUserErrorCode): string {
  switch (code) {
    case "request_parse_failed":
      return "依頼内容を読み取れませんでした。もう一度短く送ってください。";
    case "intent_classification_failed":
      return "ご依頼の目的を特定できませんでした。作りたいものを一言で教えてください。";
    case "ambiguous_request":
      return "解釈が分かれそうです。形式または目的を一言追加してください。";
    case "unsupported_intent":
      return "この内容にはまだ対応していません。代替案をご案内します。";
    case "attachment_missing":
      return "対象のファイルが添付されていません。ファイルを送ってください。";
    case "attachment_unsupported":
      return "この添付形式には対応していません。";
    case "required_information_missing":
      return "作成に必要な情報が足りません。確認事項への回答をお願いします。";
    case "output_format_conflict":
      return "指定の形式に矛盾があります。希望の形式を選び直してください。";
    case "workflow_generation_failed":
      return "作業手順の作成に失敗しました。もう一度お試しください。";
    case "routing_failed":
      return "実行先の決定に失敗しました。";
    case "permission_denied":
      return "この操作を行う権限がありません。";
    case "external_connection_required":
      return "外部サービスの接続が必要です。連携設定をご確認ください。";
    case "confirmation_required":
      return "送信・投稿などの重要操作のため、実行前の確認が必要です。";
    case "duplicate_request":
      return "同じ依頼が処理中です。完了をお待ちください。";
    case "timeout":
      return "依頼の解釈が時間切れになりました。もう一度お試しください。";
  }
}

export function isRetriableRequestCode(code: RequestUserErrorCode): boolean {
  return code === "timeout" || code === "routing_failed" || code === "workflow_generation_failed";
}
