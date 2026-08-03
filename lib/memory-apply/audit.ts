import type { MemoryApplyChannel } from "@/lib/memory-apply/types";
import { getMemoryApplyMetrics } from "@/lib/memory-apply/metrics";

export const MEMORY_APPLY_REQUIRED_CHANNELS: readonly MemoryApplyChannel[] = [
  "automation",
  "vision",
  "ocr",
  "word",
  "excel",
  "pdf",
  "powerpoint",
  "notification",
  "dashboard",
  "regenerate",
  "scheduler",
  "orchestration",
  "commander",
  "prediction",
  "workflow",
] as const;

export type MemoryApplyAuditResult = {
  pass: boolean;
  checkedAt: string;
  channels: Array<{
    channel: MemoryApplyChannel;
    applied: boolean;
    count: number;
  }>;
  missing: MemoryApplyChannel[];
  localStorageAsMemorySot: string[];
  notes: string[];
};

/**
 * Audit whether Memory apply events have been recorded for every required channel.
 * Existence of types/APIs alone is NOT pass — applied event count must be > 0.
 */
export function auditMemoryApplyCoverage(userId?: string): MemoryApplyAuditResult {
  const metrics = getMemoryApplyMetrics(userId);
  const channels = MEMORY_APPLY_REQUIRED_CHANNELS.map((channel) => ({
    channel,
    applied: (metrics.channelCoverage[channel] ?? 0) > 0,
    count: metrics.channelCoverage[channel] ?? 0,
  }));
  const missing = channels.filter((c) => !c.applied).map((c) => c.channel);

  // Known localStorage stores that must NOT be treated as Memory SoT.
  // Theme / session draft pointers are OK; profile/templates are migration targets.
  const localStorageAsMemorySot = [
    "lib/user-profile/store.ts (atlas-user-work-profile)",
    "lib/company-templates/store.ts (active company)",
    "lib/artifact-engine/org-assist-store.ts",
    "lib/workspace/sales-material/preferences.ts",
    "lib/activity-history/templates-store.ts",
  ];

  return {
    pass: missing.length === 0,
    checkedAt: new Date().toISOString(),
    channels,
    missing,
    localStorageAsMemorySot,
    notes: [
      "Personal Memory / Work Memory が永続 SoT。localStorage は Memory として扱わない。",
      "適用済み = 実行経路で Memory を読み・成果物/手順へ反映したイベントが存在する。",
    ],
  };
}
