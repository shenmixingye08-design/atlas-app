/**
 * Single Memory resolution entry for X posts, batch posts, regenerate,
 * and automation. Screens must not copy this logic.
 */

import "server-only";

import {
  describeStructuredPreferences,
  mergeStructuredPreferences,
  preferenceLayerRank,
  readStructuredPreferences,
  type StructuredPreferences,
} from "@/lib/personal-memory/preference-catalog";
import { resolveForContext } from "@/lib/personal-memory/service";
import type { MemoryPreferenceLayer, ResolvedMemoryValue } from "@/lib/personal-memory/types";
import { MEMORY_CATALOG_VERSION } from "@/lib/personal-memory/types";
import { recordMemoryQualityEvent } from "@/lib/memory-apply/quality-metrics";
import { safeLog } from "@/lib/security/redact";
import {
  EMPTY_X_SOCIAL_PREFERENCE,
  X_MEMORY_ALLOWED_SCOPES,
  X_MEMORY_DENIED_SCOPES,
  mergeXSocialPreference,
  xSocialPreferenceFromResolved,
  type XSocialPreference,
} from "@/lib/memory-apply/x-social-preference";

export type GenerationMemoryChannel =
  | "x_post"
  | "x_post_batch"
  | "x_post_regenerate"
  | "automation"
  | "regenerate"
  | "artifact";

export type GenerationMemoryResolution = {
  applied: boolean;
  memoryFailed: boolean;
  memoryIds: string[];
  scopes: string[];
  layers: Array<{ memoryId: string; layer: string; rank: number }>;
  overridden: string[];
  excluded: string[];
  preferences: StructuredPreferences;
  xPreference: XSocialPreference;
  labels: string[];
  injectionText: string;
  version: number;
  conflictsNeedUser: boolean;
};

function layerForResolved(row: ResolvedMemoryValue): MemoryPreferenceLayer {
  if (row.layer === "current_instruction") return "explicit_instruction";
  if (row.layer === "automation_override" || row.layer === "automation_config") {
    return "automation_job";
  }
  const channel = row.value.channel;
  if (channel === "x" || channel === "x_post" || channel === "sns") return "x_post";
  if (typeof channel === "string" && channel && channel !== "artifact") return "channel";
  if (row.scope === "preferred_formats") return "artifact_format";
  if (row.layer === "system_default") return "system_default";
  return "user_global";
}

export async function resolveGenerationMemory(input: {
  userId: string;
  channel: GenerationMemoryChannel;
  automationId?: string | null;
  artifactTypes?: readonly string[] | null;
  currentInstruction?: Record<string, unknown> | null;
  notes?: string | null;
  jobId?: string | null;
  batchId?: string | null;
  itemId?: string | null;
}): Promise<GenerationMemoryResolution> {
  const empty: GenerationMemoryResolution = {
    applied: false,
    memoryFailed: false,
    memoryIds: [],
    scopes: [],
    layers: [],
    overridden: [],
    excluded: [],
    preferences: mergeStructuredPreferences([]).merged,
    xPreference: { ...EMPTY_X_SOCIAL_PREFERENCE },
    labels: [],
    injectionText: "",
    version: MEMORY_CATALOG_VERSION,
    conflictsNeedUser: false,
  };

  if (!input.userId.trim()) return empty;

  const isX =
    input.channel === "x_post" ||
    input.channel === "x_post_batch" ||
    input.channel === "x_post_regenerate";

  try {
    const { result } = await resolveForContext({
      userId: input.userId,
      automationId: input.automationId ?? null,
      artifactTypes: input.artifactTypes ?? (isX ? ["x_post"] : null),
      capabilities: isX ? ["x_post", "sns"] : input.artifactTypes ?? null,
      allowedScopes: isX ? [...X_MEMORY_ALLOWED_SCOPES] : null,
      deniedScopes: isX ? [...X_MEMORY_DENIED_SCOPES] : null,
      currentInstruction: input.currentInstruction ?? null,
      notes: input.notes ?? null,
    });

    const ranked = [...result.used].sort(
      (a, b) => preferenceLayerRank(layerForResolved(a)) - preferenceLayerRank(layerForResolved(b)),
    );
    const layerPrefs = ranked.map((row) => readStructuredPreferences(row.value));
    const explicit = readStructuredPreferences(input.currentInstruction ?? undefined);
    const merged = mergeStructuredPreferences([...layerPrefs, explicit]);
    const xPreference = mergeXSocialPreference({
      memory: xSocialPreferenceFromResolved(result.used),
      explicit: {
        tone: explicit.tone ?? null,
        length: explicit.length ?? null,
        emoji: explicit.emoji ?? null,
        hashtagsMax: explicit.hashtagsMax ?? null,
        cta: explicit.cta ?? null,
        lineBreaks: explicit.lineBreaks ?? null,
        approval: explicit.approval ?? null,
        theme: explicit.preferredThemes?.[0] ?? null,
      },
    });

    const memoryIds = result.used
      .map((row) => row.memoryId)
      .filter((id) => !id.startsWith("override:"));
    const applied = memoryIds.length > 0;
    const resolution: GenerationMemoryResolution = {
      applied,
      memoryFailed: false,
      memoryIds,
      scopes: result.used.map((row) => row.scope),
      layers: result.used.map((row) => ({
        memoryId: row.memoryId,
        layer: layerForResolved(row),
        rank: preferenceLayerRank(layerForResolved(row)),
      })),
      overridden: merged.overridden,
      excluded: [
        ...merged.excluded,
        ...result.unused
          .filter((row) => row.reason === "conflict_blocked" || row.reason === "expired")
          .map((row) => row.memoryId),
      ],
      preferences: merged.merged,
      xPreference,
      labels: describeStructuredPreferences(merged.merged),
      injectionText: result.injectionText,
      version: MEMORY_CATALOG_VERSION,
      conflictsNeedUser: result.conflicts.some((conflict) => conflict.highRisk),
    };

    safeLog("info", "[memory-apply] resolved", {
      channel: input.channel,
      memoryIds: resolution.memoryIds,
      scopes: resolution.scopes,
      layers: resolution.layers.map((row) => row.layer),
      overridden: resolution.overridden,
      excluded: resolution.excluded.slice(0, 12),
      jobId: input.jobId ?? null,
      batchId: input.batchId ?? null,
      itemId: input.itemId ?? null,
      memoryVersion: resolution.version,
      applied,
    });

    if (applied) {
      recordMemoryQualityEvent({
        userId: input.userId,
        type: "memory_applied",
        channel: input.channel,
        jobId: input.jobId,
        batchId: input.batchId,
        itemId: input.itemId,
        memoryApplied: true,
      });
    }

    return resolution;
  } catch (error) {
    safeLog("warn", "[memory-apply] resolve failed", {
      channel: input.channel,
      jobId: input.jobId ?? null,
      errorName: error instanceof Error ? error.name : "Error",
    });
    recordMemoryQualityEvent({
      userId: input.userId,
      type: "memory_apply_failed",
      channel: input.channel,
      jobId: input.jobId,
      batchId: input.batchId,
      itemId: input.itemId,
      memoryApplied: false,
    });
    return { ...empty, memoryFailed: true };
  }
}
