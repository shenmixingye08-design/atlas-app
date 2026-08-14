/**
 * Apply existing Personal Memory when creating an Automation from NL.
 * Stores a snapshot (ids + structured prefs). Does not bake full Memory prose.
 * Extra LLM calls: 0.
 */

import "server-only";

import type {
  Automation,
  AutomationExecutionLevel,
  CreateAutomationInput,
} from "@/lib/automations/types";
import {
  buildAutomationMemorySnapshot,
  approvalFromPreference,
  describeAppliedPreferencesForUser,
  type AutomationMemorySnapshot,
} from "@/lib/memory-apply/automation-memory-snapshot";
import {
  EMPTY_X_SOCIAL_PREFERENCE,
  MEMORY_APPLY_EXTRA_LLM_CALLS,
  X_MEMORY_ALLOWED_SCOPES,
  X_MEMORY_DENIED_SCOPES,
  describeXSocialPreference,
  mergeXSocialPreference,
  parseXSocialPreferenceFromText,
  xSocialPreferenceFromResolved,
  type XSocialPreference,
} from "@/lib/memory-apply/x-social-preference";
import { classifyMemoryWriteIntent } from "@/lib/personal-memory/intent";
import {
  ingestCorrectionSignal,
  listPersonalMemories,
  resolveForContext,
} from "@/lib/personal-memory/service";

export type AutomationCreateMemoryApply = {
  createInput: CreateAutomationInput;
  snapshot: AutomationMemorySnapshot;
  labels: string[];
  extraLlmCalls: 0;
};

function explicitApprovalInText(text: string): boolean {
  return /投稿前に確認|必ず確認|承認してから|確認してから|確認なし|即実行|そのまま(投稿|出して)/.test(
    text,
  );
}

function definedPrefKeys(pref: Partial<XSocialPreference>): string[] {
  return Object.entries(pref)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key]) => key);
}

/**
 * Fail-open: Memory unavailable → original createInput (defaults).
 * Never bypasses existing safety gates; only sets executionLevel preference.
 */
export async function applyMemoryToAutomationCreate(input: {
  userId: string;
  text: string;
  createInput: CreateAutomationInput;
}): Promise<AutomationCreateMemoryApply> {
  const destination = input.createInput.destination === "x" ? "x" : "none";
  const explicit = parseXSocialPreferenceFromText(input.text);
  const writeIntent = classifyMemoryWriteIntent(input.text);
  const overrideOnly = writeIntent === "automation_override";

  if (
    (writeIntent === "persist_global" || writeIntent === "persist_channel") &&
    destination === "x"
  ) {
    try {
      await ingestCorrectionSignal({
        userId: input.userId,
        text: input.text,
        artifactType: "x_post",
        source: "user_explicit",
      });
    } catch {
      // Persist failure must not block automation create.
    }
  }

  let memoryPref: XSocialPreference = { ...EMPTY_X_SOCIAL_PREFERENCE };
  let memoryIds: string[] = [];
  const memoryVersions: Record<string, string> = {};
  let retrievalMs = 0;
  let confidence: number | null = null;
  const ignored: string[] = [];

  if (destination === "x") {
    const retrieveStarted = Date.now();
    try {
      const { result } = await resolveForContext({
        userId: input.userId,
        allowedScopes: [...X_MEMORY_ALLOWED_SCOPES],
        deniedScopes: [...X_MEMORY_DENIED_SCOPES],
        artifactTypes: ["x_post"],
        capabilities: ["x_post", "sns"],
        currentInstruction: overrideOnly
          ? undefined
          : (explicit as Record<string, unknown>),
        automationOverrides: overrideOnly
          ? (parseXSocialPreferenceFromText(input.text) as Record<
              string,
              unknown
            >)
          : undefined,
      });
      retrievalMs = Date.now() - retrieveStarted;
      memoryPref = xSocialPreferenceFromResolved(result.used);
      memoryIds = result.used
        .map((row) => row.memoryId)
        .filter((id) => !id.startsWith("override:"));
      const listed = await listPersonalMemories(input.userId);
      for (const id of memoryIds) {
        const row = listed.find((memory) => memory.id === id);
        if (row) memoryVersions[id] = row.updatedAt;
      }
      const confidences = result.used
        .map((row) =>
          typeof (row.value as { confidence?: number }).confidence === "number"
            ? (row.value as { confidence: number }).confidence
            : 0.8,
        );
      confidence =
        confidences.length > 0
          ? confidences.reduce((a, b) => a + b, 0) / confidences.length
          : null;
      for (const unused of result.unused) {
        if (
          unused.reason === "not_relevant" ||
          unused.reason.startsWith("status_")
        ) {
          ignored.push(unused.reason);
        }
      }
    } catch {
      retrievalMs = Date.now() - retrieveStarted;
      memoryPref = { ...EMPTY_X_SOCIAL_PREFERENCE };
    }
  }

  const applyStarted = Date.now();
  const automationOverride = overrideOnly
    ? parseXSocialPreferenceFromText(input.text)
    : {};
  const merged = mergeXSocialPreference({
    memory: memoryPref,
    automationOverride,
    explicit: overrideOnly ? {} : explicit,
  });

  let executionLevel: AutomationExecutionLevel =
    input.createInput.executionLevel ?? "approve_then_run";
  if (
    destination === "x" &&
    !explicitApprovalInText(input.text) &&
    merged.approval
  ) {
    executionLevel = approvalFromPreference(merged.approval, executionLevel);
  }
  if (explicit.approval) {
    executionLevel = approvalFromPreference(explicit.approval, executionLevel);
  }

  const snapshot = buildAutomationMemorySnapshot({
    memoryIds,
    memoryVersions,
    applied: merged,
    overridden: overrideOnly ? automationOverride : {},
    ignored: [...new Set(ignored)].slice(0, 20),
    source: overrideOnly
      ? "automation_override"
      : memoryIds.length > 0
        ? "personal_memory"
        : definedPrefKeys(explicit).length > 0
          ? "explicit"
          : "none",
    confidence,
    retrievalMs,
    applyMs: Date.now() - applyStarted,
  });

  const labels = describeXSocialPreference(merged);

  const createInput: CreateAutomationInput = {
    ...input.createInput,
    executionLevel,
    workflow: {
      ...input.createInput.workflow,
      metadata: {
        ...(input.createInput.workflow.metadata ?? {}),
        memorySnapshot: snapshot,
        memoryOverrides: overrideOnly ? automationOverride : {},
        appliedPreferenceLabels: labels,
        memoryDiagnostics: {
          automationId: null,
          userId: input.userId,
          memoryIds: snapshot.memoryIds,
          memoryVersion: snapshot.memoryVersions,
          appliedPreferences: snapshot.appliedPreferences,
          overriddenPreferences: snapshot.overriddenPreferences,
          ignoredPreferences: snapshot.ignoredPreferences,
          source: snapshot.source,
          confidence: snapshot.confidence,
          retrievalMs: snapshot.retrievalMs,
          applyMs: snapshot.applyMs,
        },
      },
    },
  };

  return {
    createInput,
    snapshot,
    labels,
    extraLlmCalls: MEMORY_APPLY_EXTRA_LLM_CALLS,
  };
}

export function snapshotFromAutomation(
  automation: Pick<Automation, "workflow">,
): AutomationMemorySnapshot | null {
  const raw = automation.workflow.metadata?.memorySnapshot;
  if (!raw || typeof raw !== "object") return null;
  return raw as AutomationMemorySnapshot;
}

export function appliedPreferenceLabelsFromAutomation(
  automation: Pick<Automation, "workflow">,
): string[] {
  const raw = automation.workflow.metadata?.appliedPreferenceLabels;
  if (Array.isArray(raw)) {
    return raw.filter((row): row is string => typeof row === "string");
  }
  return describeAppliedPreferencesForUser(snapshotFromAutomation(automation));
}
