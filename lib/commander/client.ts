import type { CommanderRunResult } from "./types";
import {
  formatUserFacingErrorText,
  toUserFacingError,
} from "@/lib/orchestration/user-errors";
import { buildCompanyOrchestrationMetadata } from "@/lib/company-templates/loader";
import { getClientActiveCompanyState } from "@/lib/company-templates/store";

export const COMMANDER_CLIENT_TIMEOUT_MS = 180_000;

export async function submitCommanderRequest(
  assignment: string,
  options?: {
    signal?: AbortSignal;
    metadata?: Readonly<Record<string, unknown>>;
    mode?: "plan" | "execute" | "confirm" | "cancel";
    runId?: string;
    confirmed?: boolean;
  },
): Promise<CommanderRunResult> {
  const { templateId } = getClientActiveCompanyState();
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(
    () =>
      timeoutController.abort(
        new DOMException("Request timed out", "TimeoutError"),
      ),
    COMMANDER_CLIENT_TIMEOUT_MS,
  );

  const combinedSignal = options?.signal
    ? AbortSignal.any([options.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await fetch("/api/commander", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignment,
        mode: options?.mode ?? "execute",
        ...(options?.runId && { runId: options.runId }),
        ...(options?.confirmed && { confirmed: true }),
        metadata: {
          ...buildCompanyOrchestrationMetadata(templateId),
          ...options?.metadata,
        },
      }),
      signal: combinedSignal,
    });

    const data = (await response.json()) as CommanderRunResult & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(
        data.error ?? formatUserFacingErrorText(toUserFacingError(data.error)),
      );
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(formatUserFacingErrorText(toUserFacingError(error)));
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function confirmCommanderRequest(
  runId: string,
  options?: { signal?: AbortSignal; metadata?: Readonly<Record<string, unknown>> },
): Promise<CommanderRunResult> {
  return submitCommanderRequest("", {
    ...options,
    mode: "confirm",
    runId,
    confirmed: true,
  });
}

export async function cancelCommanderRequest(
  runId: string,
  options?: { signal?: AbortSignal },
): Promise<CommanderRunResult> {
  return submitCommanderRequest("", {
    ...options,
    mode: "cancel",
    runId,
  });
}
