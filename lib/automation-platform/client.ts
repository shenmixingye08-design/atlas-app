import type {
  AutomationRun,
  AutomationV2,
  CreateAutomationV2Input,
  UpdateAutomationV2Input,
} from "@/lib/automation-platform/types";
import type { AutomationWizardDraft } from "@/lib/automation-platform/wizard/types";

export type AutomationPlatformErrorBody = {
  error: { code: string; message: string };
  details?: Record<string, unknown>;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | AutomationPlatformErrorBody;
  if (!response.ok) {
    const errorBody = payload as AutomationPlatformErrorBody;
    const error = new Error(
      errorBody.error?.message ?? "自動化の操作に失敗しました",
    ) as Error & { code?: string; status?: number; details?: unknown };
    error.code = errorBody.error?.code;
    error.status = response.status;
    error.details = errorBody.details;
    throw error;
  }
  return payload as T;
}

export async function fetchAutomationsV2(): Promise<AutomationV2[]> {
  const response = await fetch("/api/automation-platform", { cache: "no-store" });
  const payload = await parseResponse<{ automations: AutomationV2[] }>(response);
  return payload.automations;
}

export async function createAutomationV2(
  input: CreateAutomationV2Input,
): Promise<AutomationV2> {
  const response = await fetch("/api/automation-platform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseResponse<{ automation: AutomationV2 }>(response);
  return payload.automation;
}

export async function updateAutomationV2(
  id: string,
  patch: UpdateAutomationV2Input,
): Promise<AutomationV2> {
  const response = await fetch(`/api/automation-platform/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const payload = await parseResponse<{ automation: AutomationV2 }>(response);
  return payload.automation;
}

export async function pauseAutomationV2(id: string): Promise<AutomationV2> {
  const response = await fetch(`/api/automation-platform/${id}/pause`, {
    method: "POST",
  });
  const payload = await parseResponse<{ automation: AutomationV2 }>(response);
  return payload.automation;
}

export async function resumeAutomationV2(id: string): Promise<AutomationV2> {
  const response = await fetch(`/api/automation-platform/${id}/resume`, {
    method: "POST",
  });
  const payload = await parseResponse<{ automation: AutomationV2 }>(response);
  return payload.automation;
}

export async function duplicateAutomationV2(id: string): Promise<AutomationV2> {
  const response = await fetch(`/api/automation-platform/${id}/duplicate`, {
    method: "POST",
  });
  const payload = await parseResponse<{ automation: AutomationV2 }>(response);
  return payload.automation;
}

export async function archiveAutomationV2(id: string): Promise<AutomationV2> {
  const response = await fetch(`/api/automation-platform/${id}/archive`, {
    method: "POST",
  });
  const payload = await parseResponse<{ automation: AutomationV2 }>(response);
  return payload.automation;
}

export async function runAutomationV2(
  id: string,
  idempotencyKey?: string,
): Promise<{ run: AutomationRun; created: boolean }> {
  const response = await fetch(`/api/automation-platform/${id}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idempotencyKey }),
  });
  return parseResponse(response);
}

export async function saveAutomationDraft(
  draft: AutomationWizardDraft,
): Promise<{ draft: AutomationWizardDraft; savedAt: string }> {
  const response = await fetch("/api/automation-platform/drafts", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft }),
  });
  return parseResponse(response);
}

export async function listAutomationDrafts(): Promise<AutomationWizardDraft[]> {
  const response = await fetch("/api/automation-platform/drafts", {
    cache: "no-store",
  });
  const payload = await parseResponse<{ drafts: AutomationWizardDraft[] }>(
    response,
  );
  return payload.drafts;
}

export async function deleteAutomationDraft(draftId: string): Promise<void> {
  const response = await fetch(
    `/api/automation-platform/drafts?draftId=${encodeURIComponent(draftId)}`,
    { method: "DELETE" },
  );
  await parseResponse(response);
}

/** Local pointer only — never store notes/recipients in localStorage. */
const LOCAL_DRAFT_POINTER_KEY = "atlas.automation.wizard.pointer";

export type LocalDraftPointer = {
  draftId: string;
  currentStepId: string;
  updatedAt: string;
};

export function saveLocalDraftPointer(pointer: LocalDraftPointer): void {
  try {
    sessionStorage.setItem(LOCAL_DRAFT_POINTER_KEY, JSON.stringify(pointer));
  } catch {
    // ignore quota / private mode
  }
}

export function loadLocalDraftPointer(): LocalDraftPointer | null {
  try {
    const raw = sessionStorage.getItem(LOCAL_DRAFT_POINTER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalDraftPointer;
  } catch {
    return null;
  }
}

export function clearLocalDraftPointer(): void {
  try {
    sessionStorage.removeItem(LOCAL_DRAFT_POINTER_KEY);
  } catch {
    // ignore
  }
}
