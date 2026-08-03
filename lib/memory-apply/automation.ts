import "server-only";

import { resolveInstruction } from "@/lib/automation-platform/instruction/conflict";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type { AutomationMemoryScope } from "@/lib/automation-platform/types/memory-policy";
import type { ResolvedInstruction } from "@/lib/automation-platform/types/instruction";
import type { MemoryUsageRecord } from "@/lib/automation-platform/types/run";
import type { RunMemoryLedger } from "@/lib/personal-memory/types";
import { mapAutomationScopeToPersonal } from "@/lib/personal-memory/scopes";
import { MemoryApply } from "@/lib/memory-apply/apply";
import {
  applyContentOverlayToText,
  buildContentOverlay,
  buildDeliverableOverlay,
} from "@/lib/memory-apply/overlays";
import {
  recordMemoryApplyEvent,
  recordMemoryUpdateEvent,
} from "@/lib/memory-apply/metrics";
import {
  compareMemoryQuality,
  expectedTokensFromMemoryValues,
} from "@/lib/memory-apply/quality-diff";
import type { MemoryApplyResult } from "@/lib/memory-apply/types";
import { createPersonalMemory } from "@/lib/personal-memory/service";

function toAutomationScope(scope: string): AutomationMemoryScope | null {
  const reverse: Record<string, AutomationMemoryScope> = {
    writing_style: "writing_style",
    document_design: "document_design",
    preferred_formats: "preferred_formats",
    word_template: "preferred_templates",
    excel_template: "preferred_templates",
    powerpoint_theme: "preferred_templates",
    pdf_layout: "preferred_templates",
    default_recipients: "default_recipients",
    default_storage_locations: "default_storage_locations",
    notification_preferences: "notification_preferences",
    approval_preferences: "approval_preferences",
    timezone: "timezone",
    language: "locale",
    file_naming: "naming_conventions",
    recurring_work_preferences: "recurring_work_preferences",
  };
  return reverse[scope] ?? null;
}

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
 * Resolve Memory for an Automation run via the unified MemoryApply path.
 * Memory OFF / policy disabled → empty apply (not a fake success).
 */
export async function applyMemoryForAutomation(input: {
  automation: AutomationV2;
}): Promise<MemoryApplyResult> {
  const memoryEnabled = input.automation.memoryPolicy.enabled;
  const policy = input.automation.memoryPolicy;
  const baseline =
    input.automation.instruction.freeformNotes || input.automation.name;

  const allowed = policy.allowedScopes
    .map((scope) => mapAutomationScopeToPersonal(scope))
    .filter((scope): scope is NonNullable<typeof scope> => Boolean(scope));
  const denied = policy.deniedScopes
    .map((scope) => mapAutomationScopeToPersonal(scope))
    .filter((scope): scope is NonNullable<typeof scope> => Boolean(scope));

  const applied = await MemoryApply({
    userId: input.automation.userId,
    channel: "automation",
    baseline,
    assignment: input.automation.name,
    automationId: input.automation.id,
    memoryEnabled,
    allowedScopes: allowed.length > 0 ? allowed : null,
    deniedScopes: denied.length > 0 ? denied : null,
    automationOverrides: { ...policy.lockedOverrides },
    currentInstruction: {
      ...(input.automation.instruction.structuredOptions as Record<
        string,
        unknown
      >),
    },
    artifactTypes: input.automation.workflow.steps.map((s) => s.type),
    capabilities: input.automation.workflow.steps.map((s) => s.type),
  });

  const ledger: RunMemoryLedger = applied.provider.personalLedger;
  const injectionText = memoryEnabled
    ? applied.prompt.injection.fullText || applied.context.injectionText
    : "";
  const tokenEstimate = memoryEnabled ? applied.context.tokenEstimate : 0;
  const flat = flattenResolvedValues(ledger);
  const contentOverlay = memoryEnabled
    ? applied.context.content
    : buildContentOverlay({ values: [], injectionText: "" });
  const deliverableOverlay = memoryEnabled
    ? applied.context.deliverable
    : buildDeliverableOverlay({
        userId: input.automation.userId,
        values: [],
        injectionText: "",
        tokenEstimate: 0,
      });

  let resolvedInstruction: ResolvedInstruction | null = null;
  if (memoryEnabled) {
    resolvedInstruction = resolveInstruction({
      instruction: input.automation.instruction,
      memoryValues: flat,
      automationSaved: input.automation.instruction.structuredOptions,
    });
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

  const appliedText = memoryEnabled
    ? applyContentOverlayToText(baseline, contentOverlay)
    : baseline;
  const quality = compareMemoryQuality({
    before: baseline,
    after: appliedText,
    memoryMode: memoryEnabled ? "on" : "off",
    expectedMemoryTokens: expectedTokensFromMemoryValues(flat),
  });

  const appliedFlag =
    memoryEnabled &&
    (ledger.memoryIdsUsed.length > 0 ||
      injectionText.trim().length > 0 ||
      Object.keys(policy.lockedOverrides).length > 0);

  const used = ledger.memoryValuesResolved
    .map((row) => {
      const scope = toAutomationScope(row.scope);
      if (!scope) return null;
      return {
        scope,
        key: row.key,
        summary: row.summary,
        source:
          row.layer === "automation_override"
            ? ("locked_override" as const)
            : ("user_memory" as const),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const unusedScopes = applied.provider.unusedPersonal
    .map((row) => toAutomationScope(row.scope))
    .filter((scope): scope is AutomationMemoryScope => Boolean(scope));

  const memoryUsage: MemoryUsageRecord = {
    used,
    updated: [],
    unusedScopes: [...new Set(unusedScopes)],
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
      applied: appliedFlag,
      memoryEnabled,
      memoryIdsUsed: ledger.memoryIdsUsed,
      scopesUsed: deliverableOverlay.scopesUsed,
      injectionChars: injectionText.length,
      tokenEstimate,
      quality,
      notes: appliedFlag
        ? ["MemoryApply → PersonalizationContext → instruction merge"]
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
