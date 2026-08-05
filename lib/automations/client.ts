import { ui } from "@/lib/i18n";
import { notifyBillingUsageChanged } from "@/lib/billing/refresh-events";

import type {
  Automation,
  AutomationRunResult,
  CreateAutomationInput,
  UpdateAutomationInput,
} from "./types";

export class AutomationsClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(input: {
    message: string;
    status: number;
    code?: string;
    requestId?: string | null;
  }) {
    super(input.message);
    this.name = "AutomationsClientError";
    this.status = input.status;
    this.code = input.code ?? "automations_client_error";
    this.requestId = input.requestId ?? null;
  }
}

async function readAutomationsError(
  response: Response,
  fallback: string,
): Promise<AutomationsClientError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    requestId?: string;
  };
  return new AutomationsClientError({
    message: body.error ?? fallback,
    status: response.status,
    code: body.code,
    requestId: body.requestId ?? null,
  });
}

export async function fetchAutomations(): Promise<Automation[]> {
  const response = await fetch("/api/automations", { cache: "no-store" });

  if (!response.ok) {
    throw await readAutomationsError(response, ui.error.loadFailed);
  }

  const payload = (await response.json()) as unknown;
  // Contract: success body is an array (including []). Never treat [] as error.
  if (!Array.isArray(payload)) {
    throw new AutomationsClientError({
      message: ui.error.loadFailed,
      status: 502,
      code: "automations_invalid_response",
    });
  }
  return payload as Automation[];
}

export async function createAutomation(
  input: CreateAutomationInput,
): Promise<Automation> {
  const response = await fetch("/api/automations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw await readAutomationsError(response, ui.error.generic);
  }

  return response.json() as Promise<Automation>;
}

export async function updateAutomation(
  id: string,
  patch: UpdateAutomationInput,
): Promise<Automation> {
  const response = await fetch(`/api/automations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    throw await readAutomationsError(response, ui.error.updateFailed);
  }

  return response.json() as Promise<Automation>;
}

export async function setAutomationEnabled(
  id: string,
  enabled: boolean,
): Promise<Automation> {
  const response = await fetch(`/api/automations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });

  if (!response.ok) {
    throw await readAutomationsError(response, ui.error.updateFailed);
  }

  return response.json() as Promise<Automation>;
}

export async function runAutomationNow(
  id: string,
): Promise<AutomationRunResult> {
  const response = await fetch(`/api/automations/${id}/run`, {
    method: "POST",
  });

  if (!response.ok) {
    throw await readAutomationsError(response, ui.error.runFailed);
  }

  const result = (await response.json()) as AutomationRunResult;
  // Running an automation consumes plan usage — signal usage meters to refetch.
  notifyBillingUsageChanged();
  return result;
}

export async function tickAutomations(): Promise<{
  processed: number;
  results: AutomationRunResult[];
}> {
  const response = await fetch("/api/automations/tick", { method: "POST" });

  if (!response.ok) {
    throw await readAutomationsError(response, ui.error.automationFailed);
  }

  return response.json() as Promise<{
    processed: number;
    results: AutomationRunResult[];
  }>;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";

  const date = new Date(iso);
  const diffMs = date.getTime() - Date.now();
  const absMinutes = Math.round(Math.abs(diffMs) / 60_000);

  if (absMinutes < 1) return diffMs <= 0 ? "たった今" : "まもなく";

  if (diffMs < 0) {
    if (absMinutes < 60) return `${absMinutes}分前`;
    const hours = Math.round(absMinutes / 60);
    if (hours < 48) return `${hours}時間前`;
    return date.toLocaleDateString("ja-JP");
  }

  if (absMinutes < 60) return `${absMinutes}分後`;
  const hours = Math.round(absMinutes / 60);
  if (hours < 48) return `${hours}時間後`;
  return date.toLocaleDateString("ja-JP");
}

export function formatAutomationTimestamp(iso: string | null): string {
  return formatRelativeTime(iso);
}

export function formatAutomationDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
