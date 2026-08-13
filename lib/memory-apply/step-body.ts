/**
 * Resolve latest Personal Memory at Automation step execution and apply
 * it to the real body that will be posted / generated.
 */

import "server-only";

import {
  artifactTypesForChannel,
  type MemoryArtifactChannel,
} from "@/lib/memory-apply/channels";
import { recordMemoryApplyEvent } from "@/lib/memory-apply/metrics";
import { buildContentOverlay } from "@/lib/memory-apply/overlays";
import { applyPublishedBodyOverlay } from "@/lib/memory-apply/published-body";
import { resolveForContext } from "@/lib/personal-memory/service";
import type { PersonalMemoryScope } from "@/lib/personal-memory/types";

const STEP_BODY_SCOPES: readonly PersonalMemoryScope[] = [
  "writing_style",
  "work_content_style",
  "preferred_formats",
  "document_design",
  "wordpress_defaults",
  "recurring_work_preferences",
];

export type StepBodyMemoryApply = {
  text: string;
  applied: boolean;
  memoryIdsUsed: string[];
  appliedKeys: string[];
  channels: string[];
};

export async function applyMemoryToStepBody(input: {
  userId: string;
  channel: MemoryArtifactChannel;
  baseline: string;
  automationId?: string | null;
  assignment?: string | null;
}): Promise<StepBodyMemoryApply> {
  const baseline = (input.baseline ?? "").trim();
  if (!input.userId.trim() || !baseline) {
    return {
      text: baseline,
      applied: false,
      memoryIdsUsed: [],
      appliedKeys: [],
      channels: [],
    };
  }

  try {
    const artifactTypes = artifactTypesForChannel(input.channel);
    const { result, ledger } = await resolveForContext({
      userId: input.userId,
      automationId: input.automationId ?? undefined,
      notes: input.assignment ?? baseline.slice(0, 400),
      artifactTypes: artifactTypes.length > 0 ? artifactTypes : undefined,
      allowedScopes: STEP_BODY_SCOPES,
    });

    const overlay = buildContentOverlay({
      values: ledger.memoryValuesResolved,
      injectionText: result.injectionText,
    });
    const published = applyPublishedBodyOverlay(
      baseline,
      overlay,
      input.channel,
    );
    const memoryIdsUsed = ledger.memoryIdsUsed.filter(
      (id) => !id.startsWith("override:"),
    );
    const applied =
      memoryIdsUsed.length > 0 &&
      (published.text !== baseline || published.appliedKeys.length > 0);

    recordMemoryApplyEvent({
      userId: input.userId,
      channel:
        input.channel === "word"
          ? "word"
          : input.channel === "email"
            ? "notification"
            : "automation",
      memoryMode: applied ? "on" : "off",
      applied,
      memoryRetrieved: memoryIdsUsed.length > 0,
      memoryApplied: applied,
      memorySource: memoryIdsUsed.length > 0 ? "atlasPersonalMemory" : "none",
      appliedPreferenceKeys: published.appliedKeys,
      memoryIdsUsed,
      scopesUsed: [...new Set(ledger.memoryValuesResolved.map((row) => row.scope))],
      success: true,
    });

    return {
      text: published.text || baseline,
      applied,
      memoryIdsUsed,
      appliedKeys: published.appliedKeys,
      channels: [
        ...new Set(
          ledger.memoryValuesResolved.map((row) =>
            String(row.value.channel ?? input.channel),
          ),
        ),
      ],
    };
  } catch {
    return {
      text: baseline,
      applied: false,
      memoryIdsUsed: [],
      appliedKeys: [],
      channels: [],
    };
  }
}
