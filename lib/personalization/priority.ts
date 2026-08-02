/**
 * Memory priority resolution.
 *
 * Order (highest first):
 * 1. Explicit instruction (this run)
 * 2. Automation Memory
 * 3. Template Memory
 * 4. Company Memory
 * 5. Work Category Memory
 * 6. Artifact Type Memory
 * 7. Global Memory
 * 8. AI / system defaults
 *
 * Same-rank ties: confidence → recency → evidenceCount.
 * Unresolvable ties: ask_user (do not auto-apply).
 */

import type {
  MemoryScopeType,
  PersonalizationConflict,
  ProductionMemoryRecord,
} from "@/lib/personalization/types";
import { SCOPE_PRIORITY_RANK } from "@/lib/personalization/types";

export type PriorityResolveInput = {
  ownerId: string;
  memories: ProductionMemoryRecord[];
  explicitOverrides?: Record<string, unknown> | null;
  automationId?: string | null;
  templateId?: string | null;
  companyId?: string | null;
  category?: string | null;
  artifactType?: string | null;
  systemDefaults?: Record<string, unknown> | null;
};

export type PriorityResolvedEntry = {
  key: string;
  value: unknown;
  layer:
    | "explicit"
    | "automation"
    | "template"
    | "company"
    | "workCategory"
    | "artifactType"
    | "global"
    | "system_default";
  memoryId?: string;
  confidence?: number;
};

export type PriorityResolveResult = {
  resolved: PriorityResolvedEntry[];
  appliedMemoryIds: string[];
  ignoredMemoryIds: string[];
  conflicts: PersonalizationConflict[];
  requiresConfirmation: boolean;
  values: Record<string, unknown>;
};

function isActive(memory: ProductionMemoryRecord): boolean {
  return (
    memory.candidateStatus === "active" &&
    memory.deletedAt == null &&
    memory.disabledAt == null &&
    (!memory.highImpact || memory.approvedAt != null)
  );
}

function scopeMatches(
  memory: ProductionMemoryRecord,
  input: PriorityResolveInput,
): boolean {
  switch (memory.scopeType) {
    case "automation":
      return Boolean(
        input.automationId && memory.scopeId === input.automationId,
      );
    case "template":
      return Boolean(input.templateId && memory.scopeId === input.templateId);
    case "company":
      return Boolean(input.companyId && memory.scopeId === input.companyId);
    case "workCategory":
      return Boolean(
        (input.category && memory.scopeId === input.category) ||
          (input.category && memory.category === input.category),
      );
    case "artifactType":
      return Boolean(
        (input.artifactType && memory.scopeId === input.artifactType) ||
          (input.artifactType && memory.artifactType === input.artifactType),
      );
    case "global":
      return true;
    default:
      return false;
  }
}

function ownerOk(memory: ProductionMemoryRecord, ownerId: string): boolean {
  return memory.ownerId === ownerId;
}

function layerFor(scope: MemoryScopeType): PriorityResolvedEntry["layer"] {
  return scope;
}

function compareSameRank(
  a: ProductionMemoryRecord,
  b: ProductionMemoryRecord,
): number {
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  const aTime = Date.parse(a.updatedAt);
  const bTime = Date.parse(b.updatedAt);
  if (bTime !== aTime) return bTime - aTime;
  if (b.evidenceCount !== a.evidenceCount) {
    return b.evidenceCount - a.evidenceCount;
  }
  return 0;
}

export function resolveMemoryPriority(
  input: PriorityResolveInput,
): PriorityResolveResult {
  const conflicts: PersonalizationConflict[] = [];
  const resolved: PriorityResolvedEntry[] = [];
  const appliedMemoryIds: string[] = [];
  const ignoredMemoryIds: string[] = [];
  const values: Record<string, unknown> = {};
  const covered = new Set<string>();
  let requiresConfirmation = false;

  // 1. Explicit overrides always win
  for (const [key, value] of Object.entries(input.explicitOverrides ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    values[key] = value;
    covered.add(key);
    resolved.push({ key, value, layer: "explicit" });
  }

  const candidates = input.memories.filter(
    (m) =>
      ownerOk(m, input.ownerId) &&
      isActive(m) &&
      scopeMatches(m, input) &&
      // Cross-company / cross-automation / cross-category isolation
      (m.scopeType !== "company" || m.scopeId === input.companyId) &&
      (m.scopeType !== "automation" || m.scopeId === input.automationId) &&
      (m.category == null ||
        input.category == null ||
        m.category === input.category ||
        m.scopeType === "workCategory"),
  );

  // Group by preference key
  const byKey = new Map<string, ProductionMemoryRecord[]>();
  for (const memory of candidates) {
    const list = byKey.get(memory.key) ?? [];
    list.push(memory);
    byKey.set(memory.key, list);
  }

  for (const [key, group] of byKey) {
    if (covered.has(key)) {
      for (const m of group) ignoredMemoryIds.push(m.memoryId);
      conflicts.push({
        key,
        memoryIds: group.map((m) => m.memoryId),
        message: "明示指示が優先されたため Memory は適用しませんでした",
        resolution: "higher_priority",
      });
      continue;
    }

    const sorted = [...group].sort((a, b) => {
      const rankDiff =
        SCOPE_PRIORITY_RANK[a.scopeType] - SCOPE_PRIORITY_RANK[b.scopeType];
      if (rankDiff !== 0) return rankDiff;
      return compareSameRank(a, b);
    });

    const winner = sorted[0]!;
    const sameRank = sorted.filter(
      (m) =>
        SCOPE_PRIORITY_RANK[m.scopeType] ===
          SCOPE_PRIORITY_RANK[winner.scopeType] &&
        compareSameRank(m, winner) === 0 &&
        m.memoryId !== winner.memoryId,
    );

    if (sameRank.length > 0) {
      requiresConfirmation = true;
      conflicts.push({
        key,
        memoryIds: [winner.memoryId, ...sameRank.map((m) => m.memoryId)],
        message: "同じ優先度の好みが競合しています。確認が必要です",
        resolution: "ask_user",
      });
      for (const m of sorted) ignoredMemoryIds.push(m.memoryId);
      continue;
    }

    // Cross-scope conflict: lower ranks lose silently with ledger
    for (const loser of sorted.slice(1)) {
      ignoredMemoryIds.push(loser.memoryId);
      conflicts.push({
        key,
        memoryIds: [winner.memoryId, loser.memoryId],
        message: `上位スコープ（${winner.scopeType}）を採用しました`,
        resolution: "higher_priority",
        winningMemoryId: winner.memoryId,
      });
    }

    const value =
      winner.normalizedValue[key] ??
      winner.normalizedValue.value ??
      winner.normalizedValue;
    values[key] = value;
    covered.add(key);
    appliedMemoryIds.push(winner.memoryId);
    resolved.push({
      key,
      value,
      layer: layerFor(winner.scopeType),
      memoryId: winner.memoryId,
      confidence: winner.confidence,
    });
  }

  // 8. System defaults for uncovered keys
  for (const [key, value] of Object.entries(input.systemDefaults ?? {})) {
    if (covered.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    values[key] = value;
    covered.add(key);
    resolved.push({ key, value, layer: "system_default" });
  }

  return {
    resolved,
    appliedMemoryIds: [...new Set(appliedMemoryIds)],
    ignoredMemoryIds: [...new Set(ignoredMemoryIds)],
    conflicts,
    requiresConfirmation,
    values,
  };
}
