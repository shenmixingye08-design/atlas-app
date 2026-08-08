import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";

import { redactSecrets } from "./redact";

/**
 * P0-04: Never return provider/raw Error.message to clients in production.
 * Dev/test may see a redacted message for debugging.
 */
export function clientSafeMessage(error: unknown, fallback: string): string {
  if (isAtlasProduction()) {
    return fallback;
  }
  if (error instanceof Error && error.message.trim()) {
    return String(redactSecrets(error.message.trim()));
  }
  return fallback;
}
