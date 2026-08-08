import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";

import { publicErrorBody, redactSecrets, safeLog } from "./redact";

/**
 * Map thrown errors to a safe client Response (P0-04).
 * Production never returns stack / env / provider raw bodies.
 */
export function toPublicErrorResponse(
  error: unknown,
  options?: {
    status?: number;
    code?: string;
    diagnosticId?: string | null;
    logLabel?: string;
    fallbackMessage?: string;
  },
): Response {
  const status = options?.status ?? 500;
  const fallback =
    options?.fallbackMessage ??
    (status >= 500 ? "Internal server error" : "Request failed");

  const rawMessage =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : fallback;

  const safeMessage = isAtlasProduction()
    ? fallback
    : String(redactSecrets(rawMessage));

  if (options?.logLabel) {
    safeLog("error", options.logLabel, {
      name: error instanceof Error ? error.name : typeof error,
      message: rawMessage,
      diagnosticId: options.diagnosticId ?? null,
    });
  }

  return Response.json(
    publicErrorBody({
      error: safeMessage,
      code: options?.code,
      diagnosticId: options?.diagnosticId,
    }),
    {
      status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
