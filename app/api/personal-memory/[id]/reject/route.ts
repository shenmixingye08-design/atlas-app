import { auth } from "@clerk/nextjs/server";

import {
  enforcePersonalMemoryRateLimit,
  newPersonalMemoryDiagnosticId,
  personalMemoryActionResponse,
} from "@/lib/personal-memory/http";
import { rejectCandidate } from "@/lib/personal-memory/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const diagnosticId = newPersonalMemoryDiagnosticId("pmreject");
  let failedStage = "auth";

  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    failedStage = "rate_limit";
    const limited = await enforcePersonalMemoryRateLimit(userId, diagnosticId);
    if (limited) return limited;

    failedStage = "params";
    const { id } = await context.params;
    if (!id?.trim()) {
      return Response.json(
        {
          error: "確認待ちの記憶が見つかりませんでした。画面を再読み込みしてから、もう一度お試しください。",
          diagnosticId,
        },
        { status: 404 },
      );
    }

    try {
      const body = (await request.json()) as { userId?: string };
      if (body.userId && body.userId !== userId) {
        return Response.json(
          {
            error: "確認待ちの記憶が見つかりませんでした。画面を再読み込みしてから、もう一度お試しください。",
            diagnosticId,
          },
          { status: 404 },
        );
      }
    } catch {
      // empty body ok
    }

    failedStage = "reject";
    const memory = await rejectCandidate(userId, id);
    return Response.json({ memory, diagnosticId });
  } catch (error) {
    return personalMemoryActionResponse(error, diagnosticId, failedStage);
  }
}
