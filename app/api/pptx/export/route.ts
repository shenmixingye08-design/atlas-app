import { auth } from "@clerk/nextjs/server";

import {
  convertPresentationToPdf,
  createPptxFromAssignment,
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
      assignment?: string;
      format?: "pdf" | "markdown";
    };

    let presentation = body.presentation;
    if (!presentation && body.assignment) {
      const created = await createPptxFromAssignment({
        assignment: body.assignment,
      });
      if (!created.ok || !created.presentation) {
        return Response.json(
          { ok: false, errors: created.errors },
          { status: 422 },
        );
      }
      presentation = created.presentation;
    }

    if (!presentation) {
      return Response.json({ error: "presentation が必要です" }, { status: 400 });
    }

    if (body.format === "markdown") {
      const { presentationToMarkdown } = await import("@/lib/pptx-secretary");
      return Response.json({
        ok: true,
        format: "markdown",
        content: presentationToMarkdown(presentation),
      });
    }

    const pdf = await convertPresentationToPdf(presentation);
    if (!pdf.ok || !pdf.buffer) {
      return Response.json(
        {
          ok: false,
          code: "pdf_conversion_failed",
          error: pdf.error ?? "PDF変換に失敗しました",
        },
        { status: 422 },
      );
    }

    return Response.json({
      ok: true,
      format: "pdf",
      fileName: pdf.fileName,
      base64: pdf.buffer.toString("base64"),
      mimeType: "application/pdf",
      qualityNote:
        "スライド構成を文書PDFへ再構成しています。完全なスライド見た目の複製ではありません。",
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "export_failed",
      },
      { status: 500 },
    );
  }
}
