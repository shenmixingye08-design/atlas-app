/**
 * Lightweight client-side signal that plan usage may have changed after a
 * completion (commander / orchestrate / automation / X post). Components that
 * show usage/plan info subscribe and refetch their billing summary without a
 * full page reload. Server-safe: no-ops outside the browser.
 */
export const BILLING_USAGE_CHANGED_EVENT = "atlas:billing-usage-changed";

/** Notify listeners that billing usage may have changed. */
export function notifyBillingUsageChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BILLING_USAGE_CHANGED_EVENT));
}

/**
 * Subscribe to billing-usage-changed signals. Returns an unsubscribe fn.
 * No-op (returns a noop unsubscribe) during SSR.
 */
export function subscribeBillingUsageChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = () => handler();
  window.addEventListener(BILLING_USAGE_CHANGED_EVENT, listener);
  return () => window.removeEventListener(BILLING_USAGE_CHANGED_EVENT, listener);
}
