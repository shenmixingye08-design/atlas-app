import { auth } from "@clerk/nextjs/server";

import {
  enforcePersonalMemoryRateLimit,
  newPersonalMemoryDiagnosticId,
  personalMemoryActionResponse,
} from "@/lib/personal-memory/http";
import { approveCandidate } from "@/lib/personal-memory/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const diagnosticId = newPersonalMemoryDiagnosticId("pmconfirm");
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

    failedStage = "body";
    let scope: "global" | "automation" | "once" = "global";
    let automationId: string | undefined;
    try {
      const body = (await request.json()) as {
        scope?: "global" | "automation" | "once";
        automationId?: string;
        userId?: string;
      };
      if (body.userId && body.userId !== userId) {
        return Response.json(
          {
            error: "確認待ちの記憶が見つかりませんでした。画面を再読み込みしてから、もう一度お試しください。",
            diagnosticId,
          },
          { status: 404 },
        );
      }
      if (body.scope === "global" || body.scope === "automation" || body.scope === "once") {
        scope = body.scope;
      }
      if (typeof body.automationId === "string") {
        automationId = body.automationId.slice(0, 80);
      }
    } catch {
      // empty body ok
    }

    failedStage = "confirm";
    const memory = await approveCandidate(userId, id, { scope, automationId });
    return Response.json({ memory, diagnosticId });
  } catch (error) {
    return personalMemoryActionResponse(error, diagnosticId, failedStage);
  }
}
