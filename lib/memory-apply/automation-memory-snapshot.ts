/**
 * Automation Memory snapshot — references + applied prefs, not baked prose.
 * Re-resolved at run time by memoryIds / scopes. No extra LLM.
 */

import type { AutomationExecutionLevel } from "@/lib/automations/types";
import type { XSocialPreference } from "@/lib/memory-apply/x-social-preference";
import { describeXSocialPreference } from "@/lib/memory-apply/x-social-preference";

export type AutomationMemorySnapshot = {
  memoryIds: string[];
  memoryVersions: Record<string, string>;
  appliedPreferences: Partial<XSocialPreference>;
  overriddenPreferences: Partial<XSocialPreference>;
  ignoredPreferences: string[];
  source: "personal_memory" | "automation_override" | "explicit" | "none";
  confidence: number | null;
  capturedAt: string;
  retrievalMs: number;
  applyMs: number;
};

export type AutomationMemoryDiagnostics = {
  automationId: string | null;
  userId: string;
  memoryIds: string[];
  memoryVersion: Record<string, string>;
  appliedPreferences: Partial<XSocialPreference>;
  overriddenPreferences: Partial<XSocialPreference>;
  ignoredPreferences: string[];
  source: AutomationMemorySnapshot["source"];
  confidence: number | null;
  retrievalMs: number;
  applyMs: number;
};

export const EMPTY_AUTOMATION_MEMORY_SNAPSHOT: AutomationMemorySnapshot = {
  memoryIds: [],
  memoryVersions: {},
  appliedPreferences: {},
  overriddenPreferences: {},
  ignoredPreferences: [],
  source: "none",
  confidence: null,
  capturedAt: new Date(0).toISOString(),
  retrievalMs: 0,
  applyMs: 0,
};

export function buildAutomationMemorySnapshot(input: {
  memoryIds: string[];
  memoryVersions?: Record<string, string>;
  applied: Partial<XSocialPreference>;
  overridden?: Partial<XSocialPreference>;
  ignored?: string[];
  source?: AutomationMemorySnapshot["source"];
  confidence?: number | null;
  retrievalMs?: number;
  applyMs?: number;
  now?: Date;
}): AutomationMemorySnapshot {
  return {
    memoryIds: [...new Set(input.memoryIds.filter(Boolean))],
    memoryVersions: input.memoryVersions ?? {},
    appliedPreferences: input.applied,
    overriddenPreferences: input.overridden ?? {},
    ignoredPreferences: input.ignored ?? [],
    source: input.source ?? (input.memoryIds.length > 0 ? "personal_memory" : "none"),
    confidence: input.confidence ?? null,
    capturedAt: (input.now ?? new Date()).toISOString(),
    retrievalMs: input.retrievalMs ?? 0,
    applyMs: input.applyMs ?? 0,
  };
}

export function readAutomationMemorySnapshot(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
): AutomationMemorySnapshot | null {
  const raw = metadata?.memorySnapshot;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<AutomationMemorySnapshot>;
  if (
    !Array.isArray(row.memoryIds) &&
    !row.appliedPreferences &&
    !row.overriddenPreferences
  ) {
    return null;
  }
  return {
    ...EMPTY_AUTOMATION_MEMORY_SNAPSHOT,
    ...row,
    memoryIds: Array.isArray(row.memoryIds) ? row.memoryIds.filter((id) => typeof id === "string") : [],
    memoryVersions:
      row.memoryVersions && typeof row.memoryVersions === "object"
        ? row.memoryVersions
        : {},
    appliedPreferences: row.appliedPreferences ?? {},
    overriddenPreferences: row.overriddenPreferences ?? {},
    ignoredPreferences: Array.isArray(row.ignoredPreferences)
      ? row.ignoredPreferences.filter((x) => typeof x === "string")
      : [],
    source: row.source ?? "none",
    confidence: typeof row.confidence === "number" ? row.confidence : null,
    capturedAt: typeof row.capturedAt === "string" ? row.capturedAt : new Date(0).toISOString(),
    retrievalMs: typeof row.retrievalMs === "number" ? row.retrievalMs : 0,
    applyMs: typeof row.applyMs === "number" ? row.applyMs : 0,
  };
}

export function describeAppliedPreferencesForUser(
  snapshot: AutomationMemorySnapshot | null,
): string[] {
  if (!snapshot) return [];
  const fromApplied = describeXSocialPreference({
    tone: snapshot.appliedPreferences.tone ?? null,
    length: snapshot.appliedPreferences.length ?? null,
    emoji: snapshot.appliedPreferences.emoji ?? null,
    hashtags: snapshot.appliedPreferences.hashtags ?? null,
    hashtagsMax: snapshot.appliedPreferences.hashtagsMax ?? null,
    lineBreaks: snapshot.appliedPreferences.lineBreaks ?? null,
    promotional: snapshot.appliedPreferences.promotional ?? null,
    cta: snapshot.appliedPreferences.cta ?? null,
    theme: snapshot.appliedPreferences.theme ?? null,
    postingHour: snapshot.appliedPreferences.postingHour ?? null,
    approval: snapshot.appliedPreferences.approval ?? null,
  });
  return fromApplied;
}

export function snapshotToDiagnostics(input: {
  automationId: string | null;
  userId: string;
  snapshot: AutomationMemorySnapshot;
}): AutomationMemoryDiagnostics {
  return {
    automationId: input.automationId,
    userId: input.userId,
    memoryIds: input.snapshot.memoryIds,
    memoryVersion: input.snapshot.memoryVersions,
    appliedPreferences: input.snapshot.appliedPreferences,
    overriddenPreferences: input.snapshot.overriddenPreferences,
    ignoredPreferences: input.snapshot.ignoredPreferences,
    source: input.snapshot.source,
    confidence: input.snapshot.confidence,
    retrievalMs: input.snapshot.retrievalMs,
    applyMs: input.snapshot.applyMs,
  };
}

export function approvalFromPreference(
  approval: XSocialPreference["approval"],
  fallback: AutomationExecutionLevel,
): AutomationExecutionLevel {
  if (approval === "full_auto") return "full_auto";
  if (approval === "approve_then_run") return "approve_then_run";
  return fallback;
}
