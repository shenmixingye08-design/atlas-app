import { createHash } from "crypto";

function getAnonymizationSalt(): string {
  return process.env.ATLAS_ANON_SALT?.trim() || "atlas-anonymous-user-v1";
}

/** Derive a stable anonymous ID from an internal user ID. Never reversible. */
export function toAnonymousUserId(userId: string): string {
  const digest = createHash("sha256")
    .update(`${getAnonymizationSalt()}:${userId.trim()}`)
    .digest("hex")
    .slice(0, 10);

  return `anon_${digest}`;
}
