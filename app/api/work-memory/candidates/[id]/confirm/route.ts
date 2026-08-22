import { auth } from "@clerk/nextjs/server";

import { buildProductionDiagnosticId } from "@/lib/reliability/production-error-log";
import { safeLog } from "@/lib/security/redact";
import {
  ensureWorkMemoryHydrated,
  WorkMemoryHydrationError,
} from "@/lib/work-memory/durable";
import { confirmWorkMemoryCandidate } from "@/lib/work-memory/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const diagnosticId = buildProductionDiagnosticId("wmcconfirm");
  let failedStage = "auth";

  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    failedStage = "params";
    const { id } = await context.params;

    failedStage = "hydration";
    const hydrated = await ensureWorkMemoryHydrated(userId);
    if (!hydrated.ok) {
      return Response.json(
        {
          error:
            "記憶の読み込みに失敗しました。しばらくしてからもう一度お試しください。",
          diagnosticId,
          failedStage,
          developerCode: hydrated.developerCode,
        },
        { status: 503 },
      );
    }

    failedStage = "confirm";
    const memory = await confirmWorkMemoryCandidate(userId, id);
    if (!memory) {
      safeLog("warn", "[work-memory] confirm candidate not found", {
        diagnosticId,
        failedStage,
        candidateIdPresent: Boolean(id),
      });
      return Response.json(
        {
          error: "確認待ちの記憶が見つかりませんでした。",
          diagnosticId,
          failedStage,
        },
        { status: 404 },
      );
    }

    return Response.json({ memory, diagnosticId });
  } catch (error) {
    if (error instanceof WorkMemoryHydrationError) {
      return Response.json(
        {
          error:
            "記憶の読み込みに失敗しました。しばらくしてからもう一度お試しください。",
          diagnosticId,
          failedStage: "hydration",
          developerCode: error.developerCode,
        },
        { status: 503 },
      );
    }
    safeLog("error", "[work-memory] confirm failed", {
      diagnosticId,
      failedStage,
      errorName: error instanceof Error ? error.name : "Error",
    });
    return Response.json(
      {
        error: "記憶を保存できませんでした。",
        diagnosticId,
        failedStage,
      },
      { status: 500 },
    );
  }
}
