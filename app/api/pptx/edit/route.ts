import { auth } from "@clerk/nextjs/server";

import {
  editPptxPresentation,
  type PptxEditOperation,
  type PresentationModel,
} from "@/lib/pptx-secretary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      presentation?: PresentationModel;
      operations?: PptxEditOperation[];
      revisionNote?: string;
    };

    if (!body.presentation || !body.operations?.length) {
      return Response.json(
        { error: "presentation と operations が必要です" },
        { status: 400 },
      );
    }

    const result = await editPptxPresentation({
      presentation: body.presentation,
      operations: body.operations,
      revisionNote: body.revisionNote ?? "user_edit",
    });

    if (!result.ok || !result.buffer) {
      return Response.json(
        { ok: false, errors: result.errors },
        { status: 422 },
      );
    }

    return Response.json({
      ok: true,
      fileName: result.fileName,
      slideCount: result.slideCount,
      preview: result.preview,
      presentation: result.presentation,
      revisionNote: result.revisionNote,
      warnings: result.warnings,
      base64: result.buffer.toString("base64"),
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "edit_failed",
      },
      { status: 500 },
    );
  }
}
