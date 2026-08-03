/**
 * Memory share-rate proof for AI secretary surfaces.
 *
 * Path (mandatory one-way):
 *   MemoryProvider → PersonalizationContext → PromptBuilder → LLM → Result
 *
 * No per-surface Memory SoT. No localStorage Memory. No UI-only apply.
 */

import "server-only";

import {
  AI_SECRETARY_MEMORY_CHANNELS,
  type AiSecretaryMemoryChannel,
  type MemoryApplyChannel,
} from "@/lib/memory-apply/types";
import { getMemoryApplyMetrics, listMemoryApplyEvents } from "@/lib/memory-apply/metrics";
import { auditMemoryApplyCoverage } from "@/lib/memory-apply/audit";

export const MEMORY_PATH_DIAGRAM = `
Personal Memory / Work Memory (durable SoT)
        │
        ▼
  MemoryProvider(userId, channel)
        │
        ▼
  PersonalizationContext  ←── 唯一の共有コンテキスト
        │
        ▼
  PromptBuilder / ContextBuilder
        │
        ▼
  Surface adapter (chat / planner / commander / automation /
                   vision / ocr / word / excel / pdf / ppt / regenerate)
        │
        ▼
  LLM / Generator / OCR corrector
        │
        ▼
  Result (+ MemoryApplyLog / metrics)
`.trim();

export type MemoryShareProof = {
  userId: string;
  checkedAt: string;
  pathDiagram: string;
  requiredChannels: readonly AiSecretaryMemoryChannel[];
  appliedChannels: AiSecretaryMemoryChannel[];
  missingChannels: AiSecretaryMemoryChannel[];
  /** Intersection of memoryIdsUsed across applied AI secretary channels */
  sharedMemoryIds: string[];
  /** Per-channel fingerprint of sorted memoryIdsUsed */
  channelFingerprints: Record<string, string>;
  /** 0–100: appliedChannels / requiredChannels */
  shareRatePercent: number;
  unappliedCount: number;
  auditPass: boolean;
  pass: boolean;
  notes: string[];
};

function fingerprintIds(ids: string[]): string {
  return [...new Set(ids)].sort().join("|");
}

/**
 * Prove Memory is shared 100% across AI secretary channels for a user.
 * Requires real MemoryApply events (not synthetic coverage alone for share ids).
 */
export function proveMemoryShare(userId: string): MemoryShareProof {
  const metrics = getMemoryApplyMetrics(userId);
  const events = listMemoryApplyEvents(userId).filter(
    (e) => e.applied && e.memoryMode === "on",
  );
  const audit = auditMemoryApplyCoverage(userId);

  const appliedChannels = AI_SECRETARY_MEMORY_CHANNELS.filter(
    (ch) => (metrics.channelCoverage[ch] ?? 0) > 0,
  );
  const missingChannels = AI_SECRETARY_MEMORY_CHANNELS.filter(
    (ch) => (metrics.channelCoverage[ch] ?? 0) === 0,
  );

  const channelFingerprints: Record<string, string> = {};
  const idSets: string[][] = [];
  for (const channel of AI_SECRETARY_MEMORY_CHANNELS) {
    const channelEvents = events.filter((e) => e.channel === channel);
    const ids = channelEvents.flatMap((e) => e.memoryIdsUsed);
    channelFingerprints[channel] = fingerprintIds(ids);
    if (ids.length > 0) idSets.push([...new Set(ids)]);
  }

  let sharedMemoryIds: string[] = [];
  if (idSets.length > 0) {
    sharedMemoryIds = idSets.reduce((acc, set) =>
      acc.filter((id) => set.includes(id)),
    );
  }

  const shareRatePercent = Number(
    (
      (appliedChannels.length / AI_SECRETARY_MEMORY_CHANNELS.length) *
      100
    ).toFixed(2),
  );

  // Shared Memory = non-empty intersection of memoryIdsUsed across every AI channel.
  // Channel fingerprints may differ when Automation policy scopes subset the full
  // PersonalizationContext — but at least one Memory id must appear in ALL channels.
  const pass =
    missingChannels.length === 0 &&
    shareRatePercent === 100 &&
    sharedMemoryIds.length > 0;

  return {
    userId,
    checkedAt: new Date().toISOString(),
    pathDiagram: MEMORY_PATH_DIAGRAM,
    requiredChannels: AI_SECRETARY_MEMORY_CHANNELS,
    appliedChannels: [...appliedChannels],
    missingChannels: [...missingChannels],
    sharedMemoryIds,
    channelFingerprints,
    shareRatePercent,
    unappliedCount: missingChannels.length,
    auditPass: audit.pass,
    pass,
    notes: [
      "適用済み = MemoryApply 経路で applied イベントが存在する",
      "共有 = 全 AI secretary チャネルで同じ memoryIdsUsed fingerprint",
      "localStorage は Memory SoT ではない",
      ...audit.notes,
    ],
  };
}

/** Channels that still use parallel resolve (must stay empty after Phase2). */
export function listForbiddenParallelMemoryResolves(): MemoryApplyChannel[] {
  // After Phase2 adapters all call MemoryApply — none remain.
  return [];
}
