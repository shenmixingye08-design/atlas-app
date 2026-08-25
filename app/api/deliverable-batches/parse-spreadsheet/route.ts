import { auth } from "@clerk/nextjs/server";

import { parseSpreadsheetFile } from "@/lib/deliverable-batch/parse-spreadsheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "確認が必要です。" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "ファイルを受け取れませんでした。" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "CSV または Excel を選んでください。" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseSpreadsheetFile({
    fileName: file.name,
    mimeType: file.type,
    buffer,
  });
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  return Response.json({
    headers: parsed.headers,
    rows: parsed.rows.slice(0, 20),
    previewCount: parsed.parsed.items.length,
    duplicateWarnings: parsed.parsed.duplicateWarnings,
    emptyDropped: parsed.parsed.emptyDropped,
  });
}
