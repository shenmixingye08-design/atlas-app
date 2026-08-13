import "server-only";

import { resolveInstruction } from "@/lib/automation-platform/instruction/conflict";
import { effectiveAutomationPreferenceScopes } from "@/lib/automation-platform/memory/contract";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type { ResolvedInstruction } from "@/lib/automation-platform/types/instruction";
import type { MemoryUsageRecord } from "@/lib/automation-platform/types/run";
import { resolveMemoryForAutomation } from "@/lib/personal-memory/bridge/automation";
import type { RunMemoryLedger } from "@/lib/personal-memory/types";
import {
  applyContentOverlayToText,
  buildContentOverlay,
  buildDeliverableOverlay,
} from "@/lib/memory-apply/overlays";
import { recordMemoryApplyEvent, recordMemoryUpdateEvent } from "@/lib/memory-apply/metrics";
import {
  compareMemoryQuality,
  expectedTokensFromMemoryValues,
} from "@/lib/memory-apply/quality-diff";
import type { MemoryApplyResult } from "@/lib/memory-apply/types";
import { createPersonalMemory } from "@/lib/personal-memory/service";

function flattenResolvedValues(
  ledger: RunMemoryLedger,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const row of ledger.memoryValuesResolved) {
    flat[row.scope] = row.value;
    flat[row.key] = row.value;
    for (const [k, v] of Object.entries(row.value)) {
      if (flat[k] === undefined) flat[k] = v;
    }
  }
  return flat;
}

/**
 * Resolve Memory for an Automation run and build ResolvedInstruction.
 * Memory OFF / policy disabled → empty apply (not a fake success).
 */
export async function applyMemoryForAutomation(input: {
  automation: AutomationV2;
}): Promise<MemoryApplyResult> {
  const resolved = await resolveMemoryForAutomation({
    automation: input.automation,
  });
  const injectionText = resolved.injectionText ?? "";
  const tokenEstimate = resolved.tokenEstimate ?? 0;
  const ledger: RunMemoryLedger = {
    memoryIdsUsed: resolved.ledger?.memoryIdsUsed ?? [],
    memoryValuesResolved: resolved.ledger?.memoryValuesResolved ?? [],
    memoryConflicts: resolved.ledger?.memoryConflicts ?? [],
    memoryOverrides: resolved.ledger?.memoryOverrides ?? [],
    memoryCandidateUpdates: resolved.ledger?.memoryCandidateUpdates ?? [],
    unusedMemoryIds: resolved.ledger?.unusedMemoryIds ?? [],
  };
  const memoryEnabled =
    effectiveAutomationPreferenceScopes(input.automation.memoryPolicy).length >
      0 ||
    Object.keys(input.automation.memoryPolicy.lockedOverrides).length > 0;
  const flat = flattenResolvedValues(ledger);
  const contentOverlay = buildContentOverlay({
    values: ledger.memoryValuesResolved,
    injectionText,
  });
  const deliverableOverlay = buildDeliverableOverlay({
    userId: input.automation.userId,
    values: ledger.memoryValuesResolved,
    injectionText,
    tokenEstimate,
  });

  let resolvedInstruction: ResolvedInstruction | null = null;
  if (memoryEnabled) {
    resolvedInstruction = resolveInstruction({
      instruction: input.automation.instruction,
      memoryValues: flat,
      automationSaved: input.automation.instruction.structuredOptions,
    });
    // Ensure injection is available on merged for step invokers
    resolvedInstruction = {
      ...resolvedInstruction,
      merged: {
        ...resolvedInstruction.merged,
        memoryInjectionText: injectionText,
        memoryIdsUsed: ledger.memoryIdsUsed,
      },
      freeformNotes: [
        input.automation.instruction.freeformNotes,
        injectionText,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  const baseline = input.automation.instruction.freeformNotes || input.automation.name;
  const appliedText = memoryEnabled
    ? applyContentOverlayToText(baseline, contentOverlay)
    : baseline;
  const quality = compareMemoryQuality({
    before: baseline,
    after: appliedText,
    memoryMode: memoryEnabled ? "on" : "off",
    expectedMemoryTokens: expectedTokensFromMemoryValues(flat),
  });

  const memoryRetrieved = ledger.memoryIdsUsed.length > 0;
  const preferenceApplied =
    memoryEnabled &&
    contentOverlay.preferenceKeys.length > 0 &&
    appliedText !== baseline;
  const applied =
    memoryEnabled &&
    (memoryRetrieved ||
      injectionText.trim().length > 0 ||
      preferenceApplied ||
      Object.keys(input.automation.memoryPolicy.lockedOverrides).length > 0);

  recordMemoryApplyEvent({
    userId: input.automation.userId,
    channel: "automation",
    memoryMode: memoryEnabled ? "on" : "off",
    applied,
    memoryRetrieved,
    memoryApplied: Boolean(applied && memoryEnabled),
    memorySource: memoryRetrieved ? "atlasPersonalMemory" : "none",
    appliedPreferenceKeys: contentOverlay.preferenceKeys,
    memoryIdsUsed: ledger.memoryIdsUsed,
    scopesUsed: deliverableOverlay.scopesUsed,
    improvementRate: quality.improvementRate,
    success: true,
    correlationId: `corr_auto_${input.automation.id.slice(0, 12)}`,
  });

  const memoryUsage: MemoryUsageRecord = {
    used: resolved.memoryUsage?.used ?? [],
    updated: resolved.memoryUsage?.updated ?? [],
    unusedScopes: resolved.memoryUsage?.unusedScopes ?? [],
    memoryIdsUsed: ledger.memoryIdsUsed,
    memoryConflicts: ledger.memoryConflicts.map((c) => ({
      id: c.id,
      message: c.message,
      highRisk: c.highRisk,
    })),
    tokenEstimate,
  };

  return {
    injectionText,
    contentOverlay,
    deliverableOverlay,
    memoryUsage,
    ledger,
    resolvedInstruction,
    diagnostics: {
      channel: "automation",
      applied,
      memoryEnabled,
      memoryIdsUsed: ledger.memoryIdsUsed,
      scopesUsed: deliverableOverlay.scopesUsed,
      injectionChars: injectionText.length,
      tokenEstimate,
      quality,
      notes: applied
        ? ["Memory resolved and instruction merged"]
        : ["Memory not applied (disabled or empty)"],
      at: new Date().toISOString(),
    },
  };
}

/** Persist failure reason as a Personal Memory candidate (never auto-active). */
export async function recordAutomationMemoryFailure(input: {
  userId: string;
  automationId: string;
  runId: string;
  errorCode: string | null;
  errorMessage: string | null;
}): Promise<void> {
  try {
    await createPersonalMemory(input.userId, {
      kind: "automation_preference",
      scope: "automation_execution",
      key: "last_failure",
      title: "自動化の失敗理由",
      summary: (input.errorMessage ?? input.errorCode ?? "failed").slice(0, 160),
      value: {
        automationId: input.automationId,
        runId: input.runId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      },
      source: "automation_result",
      status: "candidate",
      confidence: 0.4,
      appliesTo: {
        global: false,
        automationIds: [input.automationId],
        artifactTypes: [],
        capabilities: [],
      },
    });
    recordMemoryUpdateEvent(input.userId, 1);
    recordMemoryApplyEvent({
      userId: input.userId,
      channel: "automation",
      memoryMode: "on",
      applied: true,
      success: false,
      failureReason: input.errorMessage ?? input.errorCode,
    });
  } catch {
    // Fail soft — never break the run terminalization on memory write.
  }
}

/** After success: store lightweight outcome candidate for future reuse. */
export async function recordAutomationMemorySuccess(input: {
  userId: string;
  automationId: string;
  runId: string;
  memoryIdsUsed: string[];
  summary: string | null;
}): Promise<void> {
  try {
    await createPersonalMemory(input.userId, {
      kind: "work_preference",
      scope: "recurring_work_preferences",
      key: "last_success_pattern",
      title: "自動化の成功パターン",
      summary: (input.summary ?? "succeeded").slice(0, 160),
      value: {
        automationId: input.automationId,
        runId: input.runId,
        memoryIdsUsed: input.memoryIdsUsed,
      },
      source: "automation_result",
      status: "candidate",
      confidence: 0.5,
      appliesTo: {
        global: false,
        automationIds: [input.automationId],
        artifactTypes: [],
        capabilities: [],
      },
    });
    recordMemoryUpdateEvent(input.userId, 1);
  } catch {
    // Fail soft
  }
}
