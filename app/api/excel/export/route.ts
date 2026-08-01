import { auth } from "@clerk/nextjs/server";

import { convertExcelExport } from "@/lib/excel-secretary";

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
      base64?: string;
      format?: "xlsx" | "xls" | "csv" | "pdf";
      title?: string;
    };
    if (!body.base64 || !body.format) {
      return Response.json(
        { error: "base64 と format が必要です", stage: "download" },
        { status: 400 },
      );
    }
    const result = await convertExcelExport({
      buffer: Buffer.from(body.base64, "base64"),
      format: body.format,
      title: body.title,
    });
    if (!result.ok || !result.buffer) {
      return Response.json(
        { ok: false, errors: result.errors, stage: "download" },
        { status: 422 },
      );
    }
    return Response.json({
      ok: true,
      fileName: result.fileName,
      mimeType: result.exportMimeType,
      warnings: result.warnings,
      base64: result.buffer.toString("base64"),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        stage: "download",
        error: error instanceof Error ? error.message : "export_failed",
      },
      { status: 500 },
    );
  }
}
