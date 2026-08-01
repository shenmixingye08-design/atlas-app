import { auth } from "@clerk/nextjs/server";

import { analyzeExcelBuffer } from "@/lib/excel-secretary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { base64?: string; title?: string };
    if (!body.base64) {
      return Response.json(
        { error: "base64 が必要です", stage: "analyze" },
        { status: 400 },
      );
    }
    const result = await analyzeExcelBuffer({
      buffer: Buffer.from(body.base64, "base64"),
      title: body.title,
    });
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 422 });
    }
    return Response.json({
      ok: true,
      analysis: result.analysis,
      preview: result.preview,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        stage: "analyze",
        error: error instanceof Error ? error.message : "analyze_failed",
      },
      { status: 500 },
    );
  }
}
