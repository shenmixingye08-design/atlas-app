import { auth } from "@clerk/nextjs/server";

import { editExcelBuffer, type ExcelEditOperation } from "@/lib/excel-secretary";

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
      operations?: ExcelEditOperation[];
      title?: string;
    };
    if (!body.base64 || !Array.isArray(body.operations)) {
      return Response.json(
        { error: "base64 と operations が必要です", stage: "edit" },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(body.base64, "base64");
    const result = await editExcelBuffer({
      buffer,
      operations: body.operations,
      title: body.title,
    });
    if (!result.ok || !result.buffer) {
      return Response.json(
        { ok: false, errors: result.errors, stage: "edit" },
        { status: 422 },
      );
    }
    return Response.json({
      ok: true,
      fileName: result.fileName,
      preview: result.preview,
      base64: result.buffer.toString("base64"),
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        stage: "edit",
        error: error instanceof Error ? error.message : "edit_failed",
      },
      { status: 500 },
    );
  }
}
