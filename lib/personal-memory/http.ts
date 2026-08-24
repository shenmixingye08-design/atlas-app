import { checkRateLimit } from "@/lib/http/rate-limit";
import {
  PersonalMemoryHydrationError,
} from "@/lib/personal-memory/durable";
import {
  PersonalMemoryError,
  clientErrorPayload,
  personalMemoryError,
} from "@/lib/personal-memory/errors";
import { buildProductionDiagnosticId } from "@/lib/reliability/production-error-log";
import { safeLog } from "@/lib/security/redact";

export const PERSONAL_MEMORY_CONFIRM_RATE_LIMIT = {
  bucket: "personal-memory-confirm",
  max: 40,
  windowMs: 60_000,
} as const;

export async function enforcePersonalMemoryRateLimit(
  userId: string,
  diagnosticId: string,
): Promise<Response | null> {
  try {
    const result = await checkRateLimit(
      `personal-memory:${userId}`,
      PERSONAL_MEMORY_CONFIRM_RATE_LIMIT,
    );
    if (result.allowed) return null;
    const error = personalMemoryError("RATE_LIMITED");
    return Response.json(clientErrorPayload(error, diagnosticId), {
      status: error.httpStatus,
    });
  } catch {
    return null;
  }
}

export function personalMemoryActionResponse(
  error: unknown,
  diagnosticId: string,
  failedStage: string,
): Response {
  if (error instanceof PersonalMemoryHydrationError) {
    return Response.json(
      {
        error:
          "記憶の読み込みに失敗しました。しばらくしてからもう一度お試しください。",
        diagnosticId,
        failedStage: "hydration",
        developerCode: error.developerCode,
        retryHint: "数秒待ってから、もう一度お試しください。",
      },
      { status: 503 },
    );
  }
  if (error instanceof PersonalMemoryError) {
    return Response.json(clientErrorPayload(error, diagnosticId), {
      status: error.httpStatus,
    });
  }
  safeLog("error", "[personal-memory] action failed", {
    diagnosticId,
    failedStage,
    errorName: error instanceof Error ? error.name : "Error",
  });
  return Response.json(
    {
      error:
        "記憶を保存できませんでした。画面を再読み込みしてから、もう一度お試しください。",
      diagnosticId,
      failedStage,
      retryHint: "数秒待ってから再試行してください。",
    },
    { status: 500 },
  );
}

export function newPersonalMemoryDiagnosticId(kind: "pmconfirm" | "pmreject"): string {
  return buildProductionDiagnosticId(kind);
}
