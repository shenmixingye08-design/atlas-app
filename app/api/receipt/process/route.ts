import { auth } from "@clerk/nextjs/server";

import { prepareMediaImages } from "@/lib/media-pipelines";
import { RECEIPT_USER_ERROR } from "@/lib/receipt/errors";
import { processReceiptImages } from "@/lib/receipt";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "multipart/form-data が必要です" }, { status: 400 });
  }

  const hint =
    typeof form.get("hint") === "string" ? String(form.get("hint")) : "";
  const companyHint =
    typeof form.get("companyHint") === "string"
      ? String(form.get("companyHint"))
      : "";
  const files = form
    .getAll("images")
    .filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return Response.json({ error: "画像を送ってください" }, { status: 400 });
  }

  try {
    const prepared = await prepareMediaImages(
      await Promise.all(
        files.map(async (file) => ({
          filename: file.name || "receipt.jpg",
          mimeType: file.type || "image/jpeg",
          bytes: Buffer.from(await file.arrayBuffer()),
        })),
      ),
    );

    const session = await processReceiptImages({
      userId,
      images: prepared,
      userHint: hint,
      companyHint: companyHint || null,
      // Business Profile 未統合時はレシート文面から推定。明示ヒントがあれば経費確認を出す。
      hasBusinessContext: Boolean(companyHint.trim()),
    });

    // P0-01: failed sessions are explicit — never HTTP 200 with fake registered data.
    if (session.status === "failed") {
      const status = session.retryable ? 503 : 422;
      return Response.json(
        {
          session,
          error: session.error ?? RECEIPT_USER_ERROR.analysisFailed,
          errorCode: session.errorCode ?? null,
          retryable: Boolean(session.retryable),
        },
        { status },
      );
    }

    return Response.json({ session });
  } catch (error) {
    // Never leak API keys / provider internals to the client.
    console.error("[receipt/process] unexpected failure", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json(
      {
        error: RECEIPT_USER_ERROR.analysisFailed,
        errorCode: "provider_error",
        retryable: true,
      },
      { status: 503 },
    );
  }
}
