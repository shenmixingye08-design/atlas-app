import { createHash } from "node:crypto";

/** Stable content hash for cache keys — never log raw image bytes. */
export function hashImageBytes(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
