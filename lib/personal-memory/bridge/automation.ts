/**
 * Bridge Personal Memory → Automation Run preparation / ledger.
 */

import "server-only";

import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import { effectiveAutomationPreferenceScopes } from "@/lib/automation-platform/memory/contract";
import type { AutomationMemoryScope } from "@/lib/automation-platform/types/memory-policy";
import type { MemoryUsageRecord } from "@/lib/automation-platform/types/run";
import { mapAutomationScopeToPersonal } from "@/lib/personal-memory/scopes";
import { resolveForContext } from "@/lib/personal-memory/service";
import type { RunMemoryLedger } from "@/lib/personal-memory/types";

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

export async function resolveMemoryForAutomation(input: {
  automation: AutomationV2;
}): Promise<{
  memoryUsage: MemoryUsageRecord;
  ledger: RunMemoryLedger;
  injectionText: string;
  tokenEstimate: number;
}> {
  const policy = input.automation.memoryPolicy;
  const readable = effectiveAutomationPreferenceScopes(policy);
  const hasOverrides = Object.keys(policy.lockedOverrides).length > 0;
  if (readable.length === 0 && !hasOverrides) {
    return {
      memoryUsage: { used: [], updated: [], unusedScopes: [] },
      ledger: {
        memoryIdsUsed: [],
        memoryValuesResolved: [],
        memoryConflicts: [],
        memoryOverrides: [],
        memoryCandidateUpdates: [],
        unusedMemoryIds: [],
      },
      injectionText: "",
      tokenEstimate: 0,
    };
  }

  const allowed = readable
    .map((scope) => mapAutomationScopeToPersonal(scope))
    .filter((scope): scope is NonNullable<typeof scope> => Boolean(scope));
  const denied = policy.deniedScopes
    .map((scope) => mapAutomationScopeToPersonal(scope))
    .filter((scope): scope is NonNullable<typeof scope> => Boolean(scope));

  const { result, ledger } = await resolveForContext({
    userId: input.automation.userId,
    allowedScopes: allowed,
    deniedScopes: denied,
    automationId: input.automation.id,
    automationOverrides: { ...policy.lockedOverrides },
    currentInstruction: {
      ...(input.automation.instruction.structuredOptions as Record<string, unknown>),
    },
    notes: input.automation.instruction.freeformNotes,
    artifactTypes: input.automation.workflow.steps.map((s) => s.type),
    capabilities: input.automation.workflow.steps.map((s) => s.type),
  });

  const used = result.used
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

  const unusedScopes = result.unused
    .map((row) => toAutomationScope(row.scope))
    .filter((scope): scope is AutomationMemoryScope => Boolean(scope));

  return {
    memoryUsage: {
      used,
      updated: [],
      unusedScopes: [...new Set(unusedScopes)],
    },
    ledger,
    injectionText: result.injectionText,
    tokenEstimate: result.tokenEstimate,
  };
}
