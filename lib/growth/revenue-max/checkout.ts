import type { CheckoutFailClass } from "./types";

export function classifyCheckoutFailure(input: {
  cancelled?: boolean;
  status?: number | null;
  message?: string | null;
  webhookSynced?: boolean;
  authenticated?: boolean;
}): CheckoutFailClass {
  if (input.cancelled) return "user_cancelled";
  if (input.authenticated === false) return "auth_expired";
  if (input.webhookSynced === false && input.status === 200) {
    return "webhook_pending";
  }
  const message = (input.message ?? "").toLowerCase();
  if (message.includes("price") && (message.includes("allowlist") || message.includes("mismatch"))) {
    return "price_mismatch";
  }
  if (message.includes("network") || message.includes("fetch") || input.status === 0) {
    return "network";
  }
  if (
    message.includes("card") ||
    message.includes("payment") ||
    message.includes("declined") ||
    message.includes("invoice")
  ) {
    return "stripe_payment_failed";
  }
  return "unknown";
}

export function shouldShowCheckoutResume(input: {
  checkoutOutcome: "started" | "completed" | "abandoned" | "failed" | null;
  resumeShownAt: string | null;
  planId: string;
}): boolean {
  if (input.planId !== "free") return false;
  if (input.checkoutOutcome !== "started" && input.checkoutOutcome !== "abandoned") {
    return false;
  }
  return !input.resumeShownAt;
}
