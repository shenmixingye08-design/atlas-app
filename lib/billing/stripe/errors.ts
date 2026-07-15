/** User-facing checkout error — keep in sync with ui.billing.checkoutFailed. */
export const CHECKOUT_USER_ERROR_MESSAGE =
  "決済画面を開けませんでした。時間をおいてもう一度お試しください。";

/** Same plan already active/trialing — do not open another Checkout. */
export const CHECKOUT_ALREADY_SAME_PLAN_MESSAGE =
  "すでに同じプランをご契約中です。追加の決済は不要です。カード変更や請求書の確認は「お支払い管理」から行えます。";

/**
 * Different paid plan is already active — change plans via Billing Portal
 * instead of creating a second subscription.
 */
export const CHECKOUT_USE_PORTAL_FOR_PLAN_CHANGE_MESSAGE =
  "別の有料プランをご契約中です。プラン変更・解約・支払い方法の更新は「お支払い管理」（Billing Portal）から行ってください。";

/** Stripe Price amount/currency does not match ATLAS plan registry. */
export const CHECKOUT_PRICE_MISMATCH_MESSAGE =
  "料金設定に不整合があります。しばらくしてから再度お試しいただくか、サポートへご連絡ください。";

/** Ops-facing config issue (keys / Price ID). Safe to show to signed-in users. */
export const CHECKOUT_CONFIG_USER_ERROR_MESSAGE =
  "決済の設定が完了していません。しばらくしてから再度お試しいただくか、サポートへご連絡ください。";

export type CheckoutErrorCode =
  | "already_same_plan"
  | "use_portal_for_plan_change"
  | "price_mismatch"
  | "stripe_not_configured"
  | "stripe_price_missing"
  | "stripe_unsafe_keys"
  | "checkout_failed";

export class CheckoutBlockedError extends Error {
  readonly userMessage: string;
  readonly code:
    | "already_same_plan"
    | "use_portal_for_plan_change"
    | "price_mismatch";

  constructor(
    code:
      | "already_same_plan"
      | "use_portal_for_plan_change"
      | "price_mismatch",
    userMessage: string,
  ) {
    super(userMessage);
    this.name = "CheckoutBlockedError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

export function isCheckoutBlockedError(
  error: unknown,
): error is CheckoutBlockedError {
  return error instanceof CheckoutBlockedError;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown checkout error";
}

/**
 * Map checkout/production-guard failures to HTTP status + stable error code.
 * Never includes secrets — only safe diagnostic codes for ops / client.
 */
export function classifyCheckoutRouteError(error: unknown): {
  status: number;
  code: CheckoutErrorCode;
  logMessage: string;
  userMessage: string;
} {
  if (isCheckoutBlockedError(error)) {
    // Duplicate / portal guidance = conflict (409).
    // price_mismatch = bad/misconfigured Price vs registry (400), not a conflict.
    return {
      status: error.code === "price_mismatch" ? 400 : 409,
      code: error.code,
      logMessage: error.message,
      userMessage: error.userMessage,
    };
  }

  const message = errorMessage(error);

  if (
    /STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be set/i.test(
      message,
    ) ||
    /Stripe is not configured for production checkout/i.test(message) ||
    /Stripe is not configured/i.test(message)
  ) {
    return {
      status: 503,
      code: "stripe_not_configured",
      logMessage: message,
      userMessage: CHECKOUT_CONFIG_USER_ERROR_MESSAGE,
    };
  }

  if (
    /test keys/i.test(message) ||
    /must both be live or both be test/i.test(message) ||
    /must be live mode/i.test(message)
  ) {
    return {
      status: 503,
      code: "stripe_unsafe_keys",
      logMessage: message,
      userMessage: CHECKOUT_CONFIG_USER_ERROR_MESSAGE,
    };
  }

  if (
    /Stripe price is not configured for plan/i.test(message) ||
    /Stripe checkout is not ready for plan/i.test(message) ||
    /Stripe price is not allowed for plan/i.test(message) ||
    /Stripe price is not in the allowlist/i.test(message)
  ) {
    return {
      status: 503,
      code: "stripe_price_missing",
      logMessage: message,
      userMessage: CHECKOUT_CONFIG_USER_ERROR_MESSAGE,
    };
  }

  return {
    status: 500,
    code: "checkout_failed",
    logMessage: message,
    userMessage: CHECKOUT_USER_ERROR_MESSAGE,
  };
}
