import type { AutomationWizardState } from "./wizard-state";

export const AUTOMATION_DRAFT_DOMAIN = "automation_draft";

export type AutomationDraftEnvelope = {
  wizard: AutomationWizardState;
  savedAt: string;
  resumeStep: AutomationWizardState["step"];
};

export function buildDraftEnvelope(
  wizard: AutomationWizardState,
): AutomationDraftEnvelope {
  return {
    wizard: { ...wizard, updatedAt: new Date().toISOString() },
    savedAt: new Date().toISOString(),
    resumeStep: wizard.step,
  };
}

export function hasMeaningfulDraft(envelope: AutomationDraftEnvelope | null): boolean {
  if (!envelope?.wizard) return false;
  return Boolean(
    envelope.wizard.title.trim() ||
      envelope.wizard.assignment.trim() ||
      envelope.wizard.step !== "work",
  );
}

/** Client-side fallback when API unavailable. */
export const AUTOMATION_DRAFT_LOCAL_KEY = "minervot_automation_draft_v1";

export function saveDraftLocally(envelope: AutomationDraftEnvelope): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      AUTOMATION_DRAFT_LOCAL_KEY,
      JSON.stringify(envelope),
    );
  } catch {
    // Quota or private mode — ignore
  }
}

export function loadDraftLocally(): AutomationDraftEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTOMATION_DRAFT_LOCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AutomationDraftEnvelope;
  } catch {
    return null;
  }
}

export function clearDraftLocally(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTOMATION_DRAFT_LOCAL_KEY);
  } catch {
    // ignore
  }
}
