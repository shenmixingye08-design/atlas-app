/** Client-safe checkout / portal URL guard. Never logs the raw URL body. */

const STRIPE_CHECKOUT_HOSTS = new Set([
  "checkout.stripe.com",
  "billing.stripe.com",
]);

function isStripeHost(hostname: string): boolean {
  return (
    STRIPE_CHECKOUT_HOSTS.has(hostname) || hostname.endsWith(".stripe.com")
  );
}

export function isAssignableCheckoutUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Local/dev mock only — relative success/portal return paths.
  if (
    trimmed.startsWith("/billing/success") ||
    trimmed.startsWith("/settings/billing")
  ) {
    return !trimmed.includes("://");
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return false;
    return isStripeHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function checkoutUrlKind(
  url: string,
): "stripe_checkout" | "stripe_portal" | "mock" | "invalid" {
  if (!isAssignableCheckoutUrl(url)) return "invalid";
  if (url.startsWith("/")) return "mock";
  try {
    const host = new URL(url).hostname;
    if (host === "billing.stripe.com" || host.endsWith(".billing.stripe.com")) {
      return "stripe_portal";
    }
    if (host === "checkout.stripe.com" || host.endsWith(".checkout.stripe.com")) {
      return "stripe_checkout";
    }
    if (host.endsWith(".stripe.com")) return "stripe_checkout";
  } catch {
    return "invalid";
  }
  return "invalid";
}
