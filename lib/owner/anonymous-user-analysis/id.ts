import { createHash } from "crypto";

import { isAtlasProduction } from "@/lib/runtime/is-production";

const DEV_FALLBACK_SALT = "atlas-anonymous-user-v1";

function getAnonymizationSalt(): string {
  const configured = process.env.ATLAS_ANON_SALT?.trim();
  if (configured) return configured;

  // P0-04: production must not use a public hardcoded salt.
  if (isAtlasProduction()) {
    throw new Error(
      "ATLAS_ANON_SALT must be configured in production for anonymous user hashing",
    );
  }

  return DEV_FALLBACK_SALT;
}

/** Derive a stable anonymous ID from an internal user ID. Never reversible. */
export function toAnonymousUserId(userId: string): string {
  const digest = createHash("sha256")
    .update(`${getAnonymizationSalt()}:${userId.trim()}`)
    .digest("hex")
    .slice(0, 10);

  return `anon_${digest}`;
}
