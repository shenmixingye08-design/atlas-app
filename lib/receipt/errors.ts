/**
 * P0-01: user-facing receipt / household AI failure messages.
 * Never include API keys, stack traces, or provider raw bodies.
 */

import type { ReceiptAiFailureCode } from "./types";

export type { ReceiptAiFailureCode };

export const RECEIPT_USER_ERROR = {
  analysisFailed:
    "画像解析を完了できませんでした。しばらくしてから再試行してください。",
  unreadable:
    "レシートを読み取れませんでした。別の画像で再試行してください。",
  notReceipt: "レシート以外の画像です。家計簿は生成しません。",
} as const;

export type ReceiptAiFailure = {
  code: ReceiptAiFailureCode;
  /** Safe for clients / session.error */
  userMessage: string;
  retryable: boolean;
};

export function failureConfigMissing(): ReceiptAiFailure {
  return {
    code: "config_missing",
    userMessage: RECEIPT_USER_ERROR.analysisFailed,
    retryable: false,
  };
}

export function failureOpenAiUnavailable(): ReceiptAiFailure {
  return {
    code: "openai_unavailable",
    userMessage: RECEIPT_USER_ERROR.analysisFailed,
    retryable: false,
  };
}

export function failureUnreadable(): ReceiptAiFailure {
  return {
    code: "unreadable",
    userMessage: RECEIPT_USER_ERROR.unreadable,
    retryable: false,
  };
}

export function failureParseFailed(): ReceiptAiFailure {
  return {
    code: "parse_failed",
    userMessage: RECEIPT_USER_ERROR.unreadable,
    retryable: false,
  };
}

export function failureNotReceipt(kind?: string): ReceiptAiFailure {
  return {
    code: "not_receipt",
    userMessage: kind
      ? `レシート以外の画像です（判定: ${kind}）。家計簿は生成しません。`
      : RECEIPT_USER_ERROR.notReceipt,
    retryable: false,
  };
}

/** Map provider exceptions without leaking secrets to clients. */
export function failureFromProviderError(error: unknown): ReceiptAiFailure {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    /OPENAI_API_KEY|not configured|api key|authentication|401|invalid.?api.?key/i.test(
      message,
    )
  ) {
    return failureConfigMissing();
  }
  // Transient / capacity — user may retry
  if (
    /429|rate.?limit|timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|502|503|504|529|overloaded/i.test(
      message,
    )
  ) {
    return {
      code: "provider_error",
      userMessage: RECEIPT_USER_ERROR.analysisFailed,
      retryable: true,
    };
  }
  return {
    code: "provider_error",
    userMessage: RECEIPT_USER_ERROR.analysisFailed,
    retryable: true,
  };
}
