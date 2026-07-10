import type { OrchestrationResult } from "@/lib/orchestration/types";
import {
  formatUserFacingErrorText,
  toUserFacingError,
} from "@/lib/orchestration/user-errors";
import { buildCompanyOrchestrationMetadata } from "@/lib/company-templates/loader";
import { getClientActiveCompanyState } from "@/lib/company-templates/store";

/** Client-side timeout — slightly above server step budget. */
export const ORCHESTRATE_CLIENT_TIMEOUT_MS = 120_000;

export async function submitWorkRequest(
  assignment: string,
  signal?: AbortSignal,
  options?: {
    metadata?: Readonly<Record<string, unknown>>;
  },
): Promise<OrchestrationResult> {
  const { templateId } = getClientActiveCompanyState();
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(
    () => timeoutController.abort(new DOMException("Request timed out", "TimeoutError")),
    ORCHESTRATE_CLIENT_TIMEOUT_MS,
  );

  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await fetch("/api/orchestrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignment,
        metadata: {
          ...buildCompanyOrchestrationMetadata(templateId),
          ...options?.metadata,
        },
      }),
      signal: combinedSignal,
    });

    const data = (await response.json()) as OrchestrationResult & {
      error?: string;
    };

    if (data.status === "failed" || !response.ok) {
      if ("executions" in data && Array.isArray(data.executions)) {
        return data as OrchestrationResult;
      }

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
