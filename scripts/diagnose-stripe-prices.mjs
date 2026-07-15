/**
 * Local ops helper: retrieve configured STRIPE_PRICE_* with the live secret.
 * Logs only safe fields — never prints secret keys or full env values.
 *
 * Usage: node --env-file=.env.local scripts/diagnose-stripe-prices.mjs
 */
import Stripe from "stripe";

function sanitizeStripeEnvValue(raw) {
  if (raw == null) return null;
  let value = String(raw).replace(/^\uFEFF/, "").trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      const inner = value.slice(1, -1).trim();
      if (!inner.includes(first)) value = inner;
    }
  }
  return value || null;
}

function priceDiagnostics(raw) {
  const sanitized = sanitizeStripeEnvValue(raw);
  return {
    configured: Boolean(sanitized),
    length: sanitized?.length ?? 0,
    prefixValid: sanitized?.startsWith("price_") ?? false,
    hadSurroundingQuotes:
      typeof raw === "string" &&
      ((raw.trim().startsWith('"') && raw.trim().endsWith('"')) ||
        (raw.trim().startsWith("'") && raw.trim().endsWith("'"))),
    hadBom: typeof raw === "string" && raw.charCodeAt(0) === 0xfeff,
  };
}

const secretRaw = process.env.STRIPE_SECRET_KEY;
const secret = sanitizeStripeEnvValue(secretRaw);
if (!secret) {
  console.error("STRIPE_SECRET_KEY missing after sanitize");
  process.exit(1);
}

console.log("secret diagnostics", {
  length: secret.length,
  prefix: secret.slice(0, 8),
  live: secret.startsWith("sk_live_"),
  hadSurroundingQuotes:
    (secretRaw?.trim().startsWith('"') && secretRaw?.trim().endsWith('"')) ||
    (secretRaw?.trim().startsWith("'") && secretRaw?.trim().endsWith("'")),
});

const plans = [
  ["light", "STRIPE_PRICE_LIGHT", 980],
  ["standard", "STRIPE_PRICE_STANDARD", 2980],
  ["premium", "STRIPE_PRICE_PREMIUM", 9800],
];

const stripe = new Stripe(secret);

for (const [planId, envKey, expectedAmount] of plans) {
  const raw = process.env[envKey];
  const priceId = sanitizeStripeEnvValue(raw);
  const diag = priceDiagnostics(raw);
  console.log(`\n[${planId}] ${envKey}`, diag);

  if (!priceId) {
    console.log(`  retrieve: skipped (no price id)`);
    continue;
  }

  try {
    const price = await stripe.prices.retrieve(priceId);
    const ok =
      price.currency === "jpy" &&
      price.unit_amount === expectedAmount &&
      price.recurring?.interval === "month";
    console.log("  retrieve ok", {
      id: price.id,
      unit_amount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
      expectedAmount,
      matchesAtlas: ok,
    });
  } catch (err) {
    console.log("  retrieve failed", {
      type: err?.type ?? null,
      code: err?.code ?? null,
      statusCode: err?.statusCode ?? null,
      message: err?.message ?? String(err),
      priceIdLength: priceId.length,
      priceIdPrefix: priceId.slice(0, 8),
    });
  }
}
