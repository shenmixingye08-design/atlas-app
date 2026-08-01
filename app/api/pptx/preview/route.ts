import { auth } from "@clerk/nextjs/server";

import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import {
  createPptxFromAssignment,
  presentationToMarkdown,
} from "@/lib/pptx-secretary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preview for a stored pptx deliverable.
 * Re-derives a structured preview from file name / linked assignment metadata when
 * full model is unavailable (lightweight, no full raster).
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
    if (stored.format !== "pptx") {
      return Response.json(
        { error: "PowerPoint成果物ではありません" },
        { status: 400 },
      );
    }

    const title = stored.fileName.replace(/\.pptx$/i, "");
    const rebuilt = await createPptxFromAssignment({
      assignment: `${title}の構成を確認`,
    });

    return Response.json({
      ok: true,
      deliverableId,
      fileName: stored.fileName,
      byteLength: stored.buffer.byteLength,
      preview: rebuilt.preview,
      note: "プレビューは構造化モデルに基づく軽量表示です。原本.pptxのダウンロードは別途可能です。",
    });
  } catch (error) {
    console.error("[pptx/preview]", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "プレビューに失敗しました",
        code: "preview_failed",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      presentation?: Parameters<typeof presentationToMarkdown>[0];
    };
    if (!body.presentation) {
      return Response.json({ error: "presentation が必要です" }, { status: 400 });
    }
    return Response.json({
      ok: true,
      markdown: presentationToMarkdown(body.presentation),
      slideCount: body.presentation.slides.length,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "preview_failed" },
      { status: 500 },
    );
  }
}
