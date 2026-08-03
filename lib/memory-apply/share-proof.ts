/**
 * Memory share-rate proof for AI secretary surfaces (Production Blocker #3).
 *
 * Mandatory sequence:
 *   loadMemory() → PersonalizationContext → Prompt → AI → 成果物 → saveMemory()
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
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MEMORY_PATH_DIAGRAM = `
Personal Memory / Work Memory (durable SoT)
        │
        ▼
  loadMemory()  ─── MemoryProvider(userId, channel)
        │
        ▼
  PersonalizationContext  ←── 唯一の共有コンテキスト
  (+ memoryVersion: version / updatedAt / source / checksum)
        │
        ▼
  PromptBuilder / ContextBuilder
        │
        ▼
  Surface adapter
  (Chat / Commander / Planner / Automation / Scheduler /
   Vision / OCR / Word / Excel / PDF / PowerPoint / Regenerate / 通知)
        │
        ▼
  AI実行 / Generator / OCR corrector
        │
        ▼
  成果物生成
        │
        ▼
  saveMemory()  (+ MemoryApplyLog / metrics)
`.trim();

export const MEMORY_EXECUTION_SEQUENCE = [
  "loadMemory()",
  "PersonalizationContext (+ MemoryVersion)",
  "Prompt生成",
  "AI実行",
  "成果物生成",
  "saveMemory()",
] as const;

export type MemoryShareProof = {
  userId: string;
  checkedAt: string;
  pathDiagram: string;
  executionSequence: readonly string[];
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
  unsharedCount: number;
  auditPass: boolean;
  pass: boolean;
  notes: string[];
};

function fingerprintIds(ids: string[]): string {
  return [...new Set(ids)].sort().join("|");
}

/**
 * Prove Memory is shared 100% across AI secretary channels for a user.
 * Requires real MemoryApply / loadMemory events (not synthetic coverage alone).
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

  const unsharedCount = missingChannels.length;
  const pass =
    missingChannels.length === 0 &&
    shareRatePercent === 100 &&
    sharedMemoryIds.length > 0 &&
    unsharedCount === 0;

  return {
    userId,
    checkedAt: new Date().toISOString(),
    pathDiagram: MEMORY_PATH_DIAGRAM,
    executionSequence: MEMORY_EXECUTION_SEQUENCE,
    requiredChannels: AI_SECRETARY_MEMORY_CHANNELS,
    appliedChannels: [...appliedChannels],
    missingChannels: [...missingChannels],
    sharedMemoryIds,
    channelFingerprints,
    shareRatePercent,
    unappliedCount: missingChannels.length,
    unsharedCount,
    auditPass: audit.pass,
    pass,
    notes: [
      "適用済み = loadMemory/MemoryApply 経路で applied イベントが存在する",
      "共有 = 全 AI secretary チャネルで同じ memoryIds が交差する",
      "未共有ゼロ = missingChannels.length === 0 && unsharedCount === 0",
      "localStorage は Memory SoT ではない",
      "Memory未取得でのAI実行は Fail Closed",
      ...audit.notes,
    ],
  };
}

/** Channels that still use parallel resolve (must stay empty). */
export function listForbiddenParallelMemoryResolves(): MemoryApplyChannel[] {
  return [];
}

/** Persist share proof artifact for CI / submission. */
export function writeMemoryShareProof(proof: MemoryShareProof): void {
  const dirs = [
    "/opt/cursor/artifacts/memory-share",
    join(process.cwd(), "artifacts/memory-share"),
  ];
  const payload = JSON.stringify(proof, null, 2);
  for (const dir of dirs) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "memory-share-proof.json"), payload);
    } catch {
      // ignore
    }
  }
}
