/**
 * MemoryProvider — single resolve entry for Personal + Work + legacy User Memory.
 * Does not invent a fourth durable store.
 */

import "server-only";

import { resolveForContext } from "@/lib/personal-memory/service";
import type {
  PersonalMemoryScope,
  ResolvedMemoryValue,
  RunMemoryLedger,
} from "@/lib/personal-memory/types";
import {
  getWorkMemoriesForAssignment,
  isWorkMemoryEnabled,
} from "@/lib/work-memory/service";
import type { WorkMemoryRecord } from "@/lib/work-memory/types";
import { formatWorkMemoriesForPlanner } from "@/lib/work-memory/metadata";
import { getMemoriesForAssignment } from "@/lib/user-memory/service";
import { formatMemoriesForPlanner } from "@/lib/user-memory/metadata";
import type { UserMemory } from "@/lib/user-memory/types";
import { resolveMemoryArtifactTypes } from "@/lib/memory-apply/channels";
import type { MemoryApplyChannel, MemoryApplyMode } from "@/lib/memory-apply/types";

export type MemoryProviderRequest = {
  userId: string;
  channel: MemoryApplyChannel;
  assignment?: string | null;
  automationId?: string | null;
  allowedScopes?: readonly PersonalMemoryScope[] | null;
  deniedScopes?: readonly PersonalMemoryScope[] | null;
  artifactTypes?: readonly string[] | null;
  /** Workflow step types (x_post / wordpress / …) — beat content classifiers. */
  stepTypes?: readonly string[] | null;
  capabilities?: readonly string[] | null;
  /** When false, returns empty resolution (Memory OFF comparison baseline). */
  memoryEnabled?: boolean;
  organizationId?: string | null;
  currentInstruction?: Record<string, unknown> | null;
  automationOverrides?: Record<string, unknown> | null;
};

export type MemoryProviderResult = {
  mode: MemoryApplyMode;
  personalValues: ResolvedMemoryValue[];
  personalLedger: RunMemoryLedger;
  personalInjectionText: string;
  personalTokenEstimate: number;
  workMemories: WorkMemoryRecord[];
  workInjectionText: string;
  userMemories: UserMemory[];
  userInjectionText: string;
  /** Combined injection for PromptBuilder */
  combinedInjectionText: string;
  tokenEstimate: number;
  memoryIdsUsed: string[];
  scopesUsed: string[];
  organizationId: string | null;
};

function emptyLedger(): RunMemoryLedger {
  return {
    memoryIdsUsed: [],
    memoryValuesResolved: [],
    memoryConflicts: [],
    memoryOverrides: [],
    memoryCandidateUpdates: [],
    unusedMemoryIds: [],
  };
}

/**
 * Hydrate + resolve Memory for any AI surface.
 * Persistence remains Personal Memory / Work Memory durable domains.
 */
export async function MemoryProvider(
  request: MemoryProviderRequest,
): Promise<MemoryProviderResult> {
  const memoryEnabled = request.memoryEnabled !== false;
  const organizationId = request.organizationId ?? null;

  if (!memoryEnabled) {
    return {
      mode: "off",
      personalValues: [],
      personalLedger: emptyLedger(),
      personalInjectionText: "",
      personalTokenEstimate: 0,
      workMemories: [],
      workInjectionText: "",
      userMemories: [],
      userInjectionText: "",
      combinedInjectionText: "",
      tokenEstimate: 0,
      memoryIdsUsed: [],
      scopesUsed: [],
      organizationId,
    };
  }

  try {
    const { ensurePersonalMemoryHydrated } = await import(
      "@/lib/personal-memory/durable"
    );
    await ensurePersonalMemoryHydrated(request.userId);
  } catch {
    // best-effort
  }
  try {
    const { ensureWorkMemoryHydrated } = await import(
      "@/lib/work-memory/durable"
    );
    await ensureWorkMemoryHydrated(request.userId);
  } catch {
    // best-effort
  }

  const { result, ledger } = await resolveForContext({
    userId: request.userId,
    allowedScopes: request.allowedScopes ?? undefined,
    deniedScopes: request.deniedScopes ?? undefined,
    automationId: request.automationId ?? undefined,
    notes: request.assignment ?? undefined,
    currentInstruction: request.currentInstruction ?? undefined,
    automationOverrides: request.automationOverrides ?? undefined,
    artifactTypes: resolveMemoryArtifactTypes({
      assignment: request.assignment,
      stepTypes: request.stepTypes,
      classifierTypes: request.artifactTypes,
    }),
    capabilities: request.capabilities ?? undefined,
  });

  const workEnabled = isWorkMemoryEnabled(request.userId);
  const workMemories =
    workEnabled && request.assignment
      ? getWorkMemoriesForAssignment(request.userId, request.assignment)
      : workEnabled
        ? getWorkMemoriesForAssignment(request.userId, request.channel)
        : [];
  const workInjectionText = formatWorkMemoriesForPlanner(workMemories) ?? "";

  const userMemories = getMemoriesForAssignment(
    request.userId,
    request.assignment ?? request.channel,
  );
  const userInjectionText = formatMemoriesForPlanner(userMemories) ?? "";

  const combinedInjectionText = [
    result.injectionText,
    workInjectionText,
    userInjectionText,
  ]
    .filter((part) => part.trim().length > 0)
    .join("\n\n");

  const scopesUsed = [
    ...new Set(result.used.map((row) => row.scope)),
  ];
  const memoryIdsUsed = [
    ...new Set([
      ...ledger.memoryIdsUsed,
      ...workMemories.map((m) => m.id),
      ...userMemories.map((m) => m.memoryId),
    ]),
  ];

  // Rough token estimate: personal already counted + ~chars/2 for others
  const tokenEstimate =
    result.tokenEstimate +
    Math.ceil((workInjectionText.length + userInjectionText.length) / 2);

  return {
    mode: "on",
    personalValues: ledger.memoryValuesResolved,
    personalLedger: ledger,
    personalInjectionText: result.injectionText,
    personalTokenEstimate: result.tokenEstimate,
    workMemories,
    workInjectionText,
    userMemories,
    userInjectionText,
    combinedInjectionText,
    tokenEstimate,
    memoryIdsUsed,
    scopesUsed,
    organizationId,
  };
}
