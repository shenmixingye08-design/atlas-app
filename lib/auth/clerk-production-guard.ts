import { isNextBuildPhase } from "@/lib/runtime/is-next-build";
import { isAtlasProduction } from "@/lib/runtime/is-production";

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** True when publishable + secret Clerk keys are present. */
export function isClerkConfigured(): boolean {
  return Boolean(
    readEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") && readEnv("CLERK_SECRET_KEY"),
  );
}

export function isClerkWebhookConfigured(): boolean {
  return Boolean(readEnv("CLERK_WEBHOOK_SECRET"));
}

/**
 * Detect Clerk Development (test) API keys.
 * Production must use pk_live_ / sk_live_ (or non-test keys).
 */
export function usesClerkDevelopmentKeys(): boolean {
  const publishable = readEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const secret = readEnv("CLERK_SECRET_KEY");
  return (
    publishable.startsWith("pk_test_") || secret.startsWith("sk_test_")
  );
}

/**
 * Production must not run with missing or Development Clerk keys.
 * Throws so middleware / startup can fail closed.
 */
export function assertClerkSafeForProduction(): void {
  if (!isAtlasProduction()) return;
  if (isNextBuildPhase()) return;

  if (!isClerkConfigured()) {
    throw new Error(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY must be set in production",
    );
  }

  if (usesClerkDevelopmentKeys()) {
    throw new Error(
      "Clerk Development keys (pk_test_ / sk_test_) must not be used in production",
    );
  }
}
