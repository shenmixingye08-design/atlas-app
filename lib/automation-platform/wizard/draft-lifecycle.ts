import { createEmptyWizardDraft } from "@/lib/automation-platform/wizard/builders";
import { proposeWizardFromNaturalLanguage } from "@/lib/automation-platform/wizard/nl-propose";
import type { AutomationWizardDraft } from "@/lib/automation-platform/wizard/types";

export const WIZARD_MISSING_DRAFT_MESSAGE =
  "指定の下書きが見つかりませんでした。新しい自動化として開始します。";

export type WizardEntryIntent =
  | { kind: "fresh" }
  | { kind: "resume"; draftId: string }
  | { kind: "seed"; seedText: string };

export type WizardBootstrapResult = {
  draft: AutomationWizardDraft;
  status: "fresh" | "resumed" | "seeded" | "resume_missing";
  missingDraftId?: string;
  message?: string;
};

export function resolveWizardEntryIntent(input: {
  draftId?: string | null;
  seedText?: string | null;
}): WizardEntryIntent {
  const seedText = input.seedText?.trim() ?? "";
  if (seedText) {
    return { kind: "seed", seedText };
  }
  const draftId = input.draftId?.trim() ?? "";
  if (draftId) {
    return { kind: "resume", draftId };
  }
  return { kind: "fresh" };
}

/**
 * Decide which draft the create wizard should open.
 *
 * `/automations/new` with no draft/seed query is always a new empty draft.
 * Implicit resume via drafts[0] or sessionStorage pointer is forbidden.
 * Missing explicit draft ids fail closed to a fresh draft — never another draft.
 */
export function bootstrapWizardDraft(input: {
  intent: WizardEntryIntent;
  drafts: AutomationWizardDraft[];
}): WizardBootstrapResult {
  const intent = input.intent;
  if (intent.kind === "seed") {
    return {
      status: "seeded",
      draft: proposeWizardFromNaturalLanguage(intent.seedText),
    };
  }

  if (intent.kind === "fresh") {
    return {
      status: "fresh",
      draft: createEmptyWizardDraft(),
    };
  }

  const found = input.drafts.find((item) => item.draftId === intent.draftId);
  if (found) {
    return { status: "resumed", draft: found };
  }

  return {
    status: "resume_missing",
    draft: createEmptyWizardDraft(),
    missingDraftId: intent.draftId,
    message: WIZARD_MISSING_DRAFT_MESSAGE,
  };
}

export function shouldSuppressWizardAutosave(input: {
  bootstrapped: boolean;
  draft: AutomationWizardDraft;
}): boolean {
  return (
    !input.bootstrapped ||
    input.draft.currentStepId === "complete" ||
    Boolean(input.draft.createdAutomationId)
  );
}

export function wizardDraftUrl(draftId: string): string {
  return `/automations/new?draft=${encodeURIComponent(draftId)}`;
}

/** Put the current draft id in the URL so refresh resumes the same editing session. */
export function syncWizardDraftToUrl(draftId: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const alreadySynced =
    url.searchParams.get("draft") === draftId && !url.searchParams.has("seed");
  if (alreadySynced) return;
  url.searchParams.set("draft", draftId);
  url.searchParams.delete("seed");
  const next = `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

export async function cleanupWizardDraftAfterCreate(input: {
  draftId: string;
  deleteDraft: (draftId: string) => Promise<void>;
  clearPointer: () => void;
  logFailure: (error: unknown) => void;
}): Promise<{ cleaned: boolean }> {
  input.clearPointer();
  try {
    await input.deleteDraft(input.draftId);
    return { cleaned: true };
  } catch (error) {
    input.logFailure(error);
    return { cleaned: false };
  }
}

function scheduleFingerprint(draft: AutomationWizardDraft): string {
  return [
    draft.triggerType,
    draft.frequency,
    draft.hour,
    draft.minute,
    draft.daysOfWeek.join(","),
    draft.dayOfMonth,
    draft.runAt ?? "",
  ].join("|");
}

function memoryFingerprint(draft: AutomationWizardDraft): string {
  return [
    draft.memoryEnabled ? "on" : "off",
    [...draft.memoryAllowedScopes].sort().join(","),
    [...draft.memoryDeniedScopes].sort().join(","),
  ].join("|");
}

export function inheritedStaleWizardFields(
  next: AutomationWizardDraft,
  stale: AutomationWizardDraft,
): string[] {
  const empty = createEmptyWizardDraft();
  const hits: string[] = [];
  if (stale.name && next.name === stale.name) hits.push("name");
  if (
    stale.steps.length > 0 &&
    next.steps.map((step) => step.type).join(",") ===
      stale.steps.map((step) => step.type).join(",") &&
    next.steps.length === stale.steps.length
  ) {
    hits.push("steps");
  }
  if (
    scheduleFingerprint(next) === scheduleFingerprint(stale) &&
    scheduleFingerprint(stale) !== scheduleFingerprint(empty)
  ) {
    hits.push("schedule");
  }
  if (stale.freeformNotes && next.freeformNotes === stale.freeformNotes) {
    hits.push("notes");
  }
  if (
    next.executionMode === stale.executionMode &&
    stale.executionMode !== empty.executionMode
  ) {
    hits.push("approval");
  }
  if (
    memoryFingerprint(next) === memoryFingerprint(stale) &&
    memoryFingerprint(stale) !== memoryFingerprint(empty)
  ) {
    hits.push("memory");
  }
  return hits;
}
