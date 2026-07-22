import { createHash } from "node:crypto";

import type { DeliverableFormat } from "./types";

/** Stable hash for content + format — used to skip identical regenerations. */
export function buildDeliverableContentHash(
  content: string,
  format: DeliverableFormat,
  baseFileName: string,
): string {
  return createHash("sha256")
    .update(`${format}\n${baseFileName}\n${content.trim()}`)
    .digest("hex")
    .slice(0, 32);
}
