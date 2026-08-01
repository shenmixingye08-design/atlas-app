import { auth } from "@clerk/nextjs/server";

import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { ExcelSecretaryError, previewWorkbook } from "@/lib/excel-secretary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/excel/preview?deliverableId=...
 * Excel 成果物のシート一覧・先頭行プレビュー。
 */
export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deliverableId = new URL(request.url).searchParams
    .get("deliverableId")
    ?.trim();
  if (!deliverableId) {
    return Response.json({ error: "deliverableId が必要です" }, { status: 400 });
  }

  try {
    const stored = await getStoredDeliverableForUser(deliverableId, userId);
    if (!stored) {
      return Response.json({ error: "成果物が見つかりません" }, { status: 404 });
    }
    if (stored.format !== "xlsx") {
      return Response.json(
        { error: "Excel 成果物ではありません", stage: "ai_analysis" },
        { status: 400 },
      );
    }

    const preview = await previewWorkbook(stored.buffer, stored.fileName);
    return Response.json({
      ok: true,
      deliverableId,
      fileName: stored.fileName,
      format: stored.format,
      ...preview,
    });
  } catch (error) {
    if (error instanceof ExcelSecretaryError) {
      return Response.json(
        { error: error.message, stage: error.stage, code: error.code },
        { status: 422 },
      );
    }
    console.error("[excel/preview]", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "プレビューに失敗しました",
        stage: "ai_analysis",
      },
      { status: 500 },
    );
  }
}
