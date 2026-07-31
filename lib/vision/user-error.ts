import type { VisionErrorCode } from "@/lib/vision/types";
import type { VisionPipelineStage } from "@/lib/vision/failure-stage";

/** User-facing copy for OpenAI Vision timeout (temporary congestion). */
export const VISION_TIMEOUT_USER_MESSAGE =
  "画像解析サーバーが混み合っています。\n画像は受信できていますので、数秒後に再解析してください。";

export const VISION_NEEDS_INPUT_USER_MESSAGE =
  "画像から依頼内容を読み取れませんでした。";

export const VISION_UNSUPPORTED_IMAGE_USER_MESSAGE =
  "対応していない画像形式です。";

export const VISION_RATE_LIMIT_USER_MESSAGE = "現在アクセスが集中しています。";

export const VISION_NETWORK_USER_MESSAGE = "通信エラーが発生しました。";

/**
 * Japanese user-facing copy for vision failures.
 * Never expose OpenAI internal error bodies / request_id here.
 */
export function userMessageForVisionFailure(input: {
  code?: VisionErrorCode | string | null;
  failedStage?: VisionPipelineStage | string | null;
  openaiCode?: string | null;
  openaiMessage?: string | null;
  httpStatus?: number | null;
}): string {
  const openaiCode = (input.openaiCode ?? "").toLowerCase();
  const openaiMessage = input.openaiMessage ?? "";

  if (
    input.code === "config_missing" ||
    openaiCode === "invalid_api_key" ||
    /model.*not|does not exist|unsupported model/i.test(openaiMessage)
  ) {
    return "解析用モデルの設定に問題があります。管理者にお問い合わせください。";
  }

  if (
    input.code === "unsupported_type" ||
    input.code === "invalid_data_url" ||
    input.code === "corrupt_image" ||
    openaiCode === "invalid_image" ||
    openaiCode === "invalid_image_format" ||
    /image could not be processed|invalid image|unsupported.?image/i.test(
      openaiMessage,
    )
  ) {
    return VISION_UNSUPPORTED_IMAGE_USER_MESSAGE;
  }

  if (input.code === "too_large" || /too large|maximum.*size/i.test(openaiMessage)) {
    return "画像が大きすぎたため圧縮に失敗しました。解像度を下げて再度お試しください。";
  }

  if (
    input.code === "rate_limited" ||
    input.httpStatus === 429 ||
    openaiCode === "rate_limit_exceeded"
  ) {
    return VISION_RATE_LIMIT_USER_MESSAGE;
  }

  if (
    input.code === "timeout" ||
    input.httpStatus === 408 ||
    input.httpStatus === 504 ||
    /timeout|timed out|vision_openai_timeout/i.test(openaiMessage)
  ) {
    return VISION_TIMEOUT_USER_MESSAGE;
  }

  if (
    input.code === "network" ||
    /ECONNRESET|ENOTFOUND|ECONNREFUSED|socket hang up|fetch failed|network|APIConnectionError/i.test(
      openaiMessage,
    )
  ) {
    return VISION_NETWORK_USER_MESSAGE;
  }

  if (
    input.httpStatus === 500 ||
    input.httpStatus === 502 ||
    input.httpStatus === 503 ||
    openaiCode === "server_error"
  ) {
    return VISION_RATE_LIMIT_USER_MESSAGE;
  }

  if (
    input.code === "json_parse_failed" ||
    input.code === "unreadable" ||
    openaiCode === "empty_content"
  ) {
    return "画像の文字を読み取れませんでした。ピントの合った写真でもう一度お試しください。";
  }

  if (
    input.code === "empty_image" ||
    input.code === "not_found" ||
    input.code === "storage_failed"
  ) {
    return "画像を取得できませんでした。もう一度アップロードしてください。";
  }

  if (input.failedStage === "preprocess") {
    return VISION_UNSUPPORTED_IMAGE_USER_MESSAGE;
  }

  if (input.failedStage === "vision_response" || input.code === "openai_failed") {
    return "画像の内容を解析できませんでした。再解析するか、別の画像でお試しください。";
  }

  return "画像処理に失敗しました。内容を確認して再試行してください。";
}
