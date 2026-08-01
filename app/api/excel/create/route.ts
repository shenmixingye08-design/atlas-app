import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  createExcelFromAssignment,
  createExcelFromUpload,
} from "@/lib/excel-secretary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Create Excel from natural language and/or uploaded file.
 * Returns binary xlsx + preview JSON for the deliverable UI.
 */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const assignment = String(form.get("assignment") ?? "");
      const file = form.get("file");
      if (file instanceof File) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await createExcelFromUpload({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          buffer,
          title: assignment || file.name,
        });
        if (!result.ok || !result.buffer) {
          return Response.json(
            {
              ok: false,
              errors: result.errors,
              stage: result.errors[0]?.stage ?? "excel_build",
            },
            { status: 422 },
          );
        }
        return Response.json({
          ok: true,
          fileName: result.fileName,
          preview: result.preview,
          warnings: result.warnings,
          base64: result.buffer.toString("base64"),
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      }
    }

    const body = (await request.json()) as {
      assignment?: string;
      contentMarkdown?: string;
    };
    const assignment = body.assignment?.trim() ?? "";
    if (!assignment) {
      return Response.json(
        { error: "何のExcelを作るか書いてください。", stage: "intent" },
        { status: 400 },
      );
    }

    const result = await createExcelFromAssignment({
      assignment,
      contentMarkdown: body.contentMarkdown,
    });
    if (!result.ok || !result.buffer) {
      return Response.json(
        {
          ok: false,
          errors: result.errors,
          stage: result.errors[0]?.stage ?? "excel_build",
        },
        { status: 422 },
      );
    }

    // Persist async breadcrumb without blocking response.
    after(() => {
      console.info("[excel-secretary] created", {
        userId,
        fileName: result.fileName,
        sheets: result.preview?.sheets.length ?? 0,
      });
    });

    return Response.json({
      ok: true,
      fileName: result.fileName,
      preview: result.preview,
      warnings: result.warnings,
      base64: result.buffer.toString("base64"),
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        stage: "excel_build",
        error: error instanceof Error ? error.message : "excel_create_failed",
      },
      { status: 500 },
    );
  }
}
