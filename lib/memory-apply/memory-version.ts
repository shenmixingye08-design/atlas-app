/**
 * Memory Version — integrity metadata for PersonalizationContext.
 * Every shared context carries version / updatedAt / source / checksum.
 */

import { createHash } from "node:crypto";

import type { MemoryApplyChannel } from "@/lib/memory-apply/types";
import type { MemoryProviderResult } from "@/lib/memory-apply/provider";

export type MemoryVersionSource =
  | "personal_memory"
  | "work_memory"
  | "user_memory"
  | "combined"
  | "memory_off"
  | "empty";

export type MemoryVersion = {
  /** Monotonic-ish version string derived from content + clock */
  version: string;
  updatedAt: string;
  source: MemoryVersionSource;
  /** sha256 of sorted memory ids + injection + scopes */
  checksum: string;
};

export function buildMemoryVersion(input: {
  channel: MemoryApplyChannel;
  provider: MemoryProviderResult;
}): MemoryVersion {
  const updatedAt = new Date().toISOString();
  const ids = [...input.provider.memoryIdsUsed].sort();
  const scopes = [...input.provider.scopesUsed].sort();
  const payload = JSON.stringify({
    channel: input.channel,
    mode: input.provider.mode,
    ids,
    scopes,
    injection: input.provider.combinedInjectionText,
    tokenEstimate: input.provider.tokenEstimate,
  });
  const checksum = createHash("sha256").update(payload).digest("hex");

  let source: MemoryVersionSource = "empty";
  if (input.provider.mode === "off") {
    source = "memory_off";
  } else if (ids.length > 0) {
    const hasPersonal = input.provider.personalValues.length > 0;
    const hasWork = input.provider.workMemories.length > 0;
    const hasUser = input.provider.userMemories.length > 0;
    const kinds = [hasPersonal, hasWork, hasUser].filter(Boolean).length;
    if (kinds > 1) source = "combined";
    else if (hasPersonal) source = "personal_memory";
    else if (hasWork) source = "work_memory";
    else if (hasUser) source = "user_memory";
    else source = "combined";
  }

  // version = short checksum prefix + timestamp for uniqueness
  const version = `mv_${checksum.slice(0, 12)}_${Date.parse(updatedAt).toString(36)}`;

  return {
    version,
    updatedAt,
    source,
    checksum,
  };
}

export function assertMemoryVersionComplete(version: MemoryVersion): void {
  if (!version.version?.trim()) {
    throw new Error("memory_version_missing:version");
  }
  if (!version.updatedAt?.trim()) {
    throw new Error("memory_version_missing:updatedAt");
  }
  if (!version.source?.trim()) {
    throw new Error("memory_version_missing:source");
  }
  if (!version.checksum || version.checksum.length < 32) {
    throw new Error("memory_version_missing:checksum");
  }
}
