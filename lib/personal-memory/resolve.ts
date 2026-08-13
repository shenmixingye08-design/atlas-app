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

  // Layer 5 — memories (automation-specific already preferred in selectRelevant)
  for (const memory of relevant) {
    // Current instruction / locked override still win for this key/scope.
    if (coveredScopes.has(memory.scope) || coveredScopes.has(memory.key)) {
      continue;
    }
    const coverKey = `${memory.scope}:${memory.key}:${channelCoverSuffix(memory)}`;
    if (coveredScopes.has(coverKey)) continue;
    const layer = memory.appliesTo.global
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
