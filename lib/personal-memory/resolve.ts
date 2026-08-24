/**
 * Memory resolution with strict priority:
 * 1 current instruction → 2 notes → 3 automation config →
 * 4 automation override → 5 global memory → 6 system default
 *
 * Memory never silently overrides current instruction.
 */

import type {
  MemoryResolutionResult,
  PersonalMemoryRecord,
  PersonalMemorySettings,
  ResolvedMemoryValue,
  RunMemoryLedger,
} from "@/lib/personal-memory/types";
import { applyConflictPolicy, detectMemoryConflicts } from "@/lib/personal-memory/conflict";
import { buildInjectionText, selectRelevantMemories } from "@/lib/personal-memory/cost";
import { isExpired } from "@/lib/personal-memory/retention";
import { mapAutomationScopeToPersonal } from "@/lib/personal-memory/scopes";

export type ResolveMemoryInput = {
  userId: string;
  settings: PersonalMemorySettings;
  memories: PersonalMemoryRecord[];
  /** Layer 1 — explicit this-run settings */
  currentInstruction?: Record<string, unknown> | null;
  /** Layer 2 — freeform notes */
  notes?: string | null;
  /** Layer 3 — automation structured config */
  automationConfig?: Record<string, unknown> | null;
  /** Layer 4 — automation locked overrides */
  automationOverrides?: Record<string, unknown> | null;
  allowedScopes?: readonly string[] | null;
  deniedScopes?: readonly string[] | null;
  automationId?: string | null;
  artifactTypes?: readonly string[] | null;
  capabilities?: readonly string[] | null;
  systemDefaults?: Record<string, unknown> | null;
};

function channelCoverSuffix(memory: PersonalMemoryRecord): string {
  if (memory.appliesTo.global) return "global";
  return [...memory.appliesTo.artifactTypes].sort().join("|") || "local";
}

function asResolved(
  memory: PersonalMemoryRecord,
  layer: ResolvedMemoryValue["layer"],
): ResolvedMemoryValue {
  return {
    memoryId: memory.id,
    scope: memory.scope,
    key: memory.key,
    value: memory.value,
    title: memory.title,
    summary: memory.summary,
    source: memory.source,
    layer,
    sensitivity: memory.sensitivity,
  };
}

export function resolvePersonalMemories(
  input: ResolveMemoryInput,
): MemoryResolutionResult {
  if (!input.settings.enabled) {
    return {
      used: [],
      unused: input.memories.map((m) => ({
        memoryId: m.id,
        scope: m.scope,
        reason: "memory_disabled",
      })),
      conflicts: [],
      overrides: [],
      candidatesProposed: [],
      injectionText: "",
      tokenEstimate: 0,
      truncated: false,
    };
  }

  const now = Date.now();
  const active = input.memories.filter((m) => {
    if (m.status === "active") {
      if (isExpired(m.expiresAt, now)) return false;
      return true;
    }
    return false;
  });

  const relevant = selectRelevantMemories({
    memories: active,
    allowedScopes: input.allowedScopes,
    deniedScopes: input.deniedScopes,
    automationId: input.automationId,
    artifactTypes: input.artifactTypes,
    capabilities: input.capabilities,
    settings: input.settings,
  });

  const instructionKeys = input.currentInstruction ?? {};
  const conflicts = detectMemoryConflicts({
    candidates: relevant,
    currentInstructionKeys: instructionKeys,
    notesText: input.notes,
  });

  const used: ResolvedMemoryValue[] = [];
  const overrides: ResolvedMemoryValue[] = [];
  const coveredScopes = new Set<string>();

  // Layer 1 — current instruction wins (not stored as memory use)
  for (const [key, value] of Object.entries(instructionKeys)) {
    if (value === undefined || value === null || value === "") continue;
    coveredScopes.add(key);
  }

  // Layer 4 — automation overrides (before global memory)
  for (const [key, value] of Object.entries(input.automationOverrides ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (coveredScopes.has(key)) continue;
    const scope = mapAutomationScopeToPersonal(key) ?? "recurring_work_preferences";
    overrides.push({
      memoryId: `override:${key}`,
      scope,
      key,
      value: typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : { value },
      title: key,
      summary: String(value).slice(0, 80),
      source: "automation",
      layer: "automation_override",
      sensitivity: "normal",
    });
    coveredScopes.add(key);
    coveredScopes.add(scope);
  }

  const ranked = [...relevant].sort((a, b) => {
    const score = (row: typeof a) =>
      (row.appliesTo.automationIds.length > 0 ? 4 : 0) +
      (row.appliesTo.artifactTypes.includes("x_post") ? 3 : 0) +
      (row.appliesTo.artifactTypes.length > 0 && !row.appliesTo.global ? 2 : 0) +
      (row.appliesTo.global ? 0 : 1);
    return score(b) - score(a) || b.updatedAt.localeCompare(a.updatedAt);
  });

  // Layer 5 — memories (automation / channel / global). Forbidden always unions.
  for (const memory of ranked) {
    const coverKey = `${memory.scope}:${memory.key}:${channelCoverSuffix(memory)}`;
    const forbidden = [
      ...((memory.value.forbiddenWords as unknown[]) ?? []),
      ...((memory.value.forbiddenExpressions as unknown[]) ?? []),
      ...((memory.value.forbiddenFacts as unknown[]) ?? []),
    ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);

    if (coveredScopes.has(memory.scope) || coveredScopes.has(memory.key) || coveredScopes.has(coverKey)) {
      if (forbidden.length > 0) {
        const host = used.find((row) => row.scope === memory.scope) ?? overrides.find((row) => row.scope === memory.scope);
        if (host) {
          const current = [
            ...((host.value.forbiddenWords as string[]) ?? []),
            ...((host.value.forbiddenExpressions as string[]) ?? []),
          ];
          host.value = {
            ...host.value,
            forbiddenWords: [...new Set([...current, ...forbidden])],
          };
        }
      }
      continue;
    }
    const layer = memory.appliesTo.automationIds.length > 0
      ? "automation_override"
      : memory.appliesTo.global
        ? "global_memory"
        : "automation_override";
    used.push(asResolved(memory, layer));
    coveredScopes.add(coverKey);
  }

  const policy = applyConflictPolicy({ conflicts, resolved: used });
  const finalUsed = [...overrides, ...policy.resolved];

  const unused = input.memories
    .filter((m) => !finalUsed.some((u) => u.memoryId === m.id))
    .map((m) => ({
      memoryId: m.id,
      scope: m.scope,
      reason:
        m.status !== "active"
          ? `status_${m.status}`
          : isExpired(m.expiresAt, now)
            ? "expired"
            : policy.blockedMemoryIds.includes(m.id)
              ? "conflict_blocked"
              : "not_relevant",
    }));

  const injection = buildInjectionText(
    finalUsed.filter((u) => u.layer === "global_memory" || u.layer === "automation_override"),
    input.settings.maxInjectionChars,
  );

  return {
    used: finalUsed,
    unused,
    conflicts,
    overrides,
    candidatesProposed: input.memories
      .filter((m) => m.status === "candidate")
      .map((m) => m.id)
      .slice(0, input.settings.candidateNotifyBatchSize),
    injectionText: injection.text,
    tokenEstimate: injection.tokenEstimate,
    truncated: injection.truncated,
  };
}

export function toRunMemoryLedger(
  result: MemoryResolutionResult,
): RunMemoryLedger {
  return {
    memoryIdsUsed: result.used
      .map((u) => u.memoryId)
      .filter((id) => !id.startsWith("override:")),
    memoryValuesResolved: result.used,
    memoryConflicts: result.conflicts,
    memoryOverrides: result.overrides,
    memoryCandidateUpdates: result.candidatesProposed,
    unusedMemoryIds: result.unused.map((u) => u.memoryId),
  };
}
