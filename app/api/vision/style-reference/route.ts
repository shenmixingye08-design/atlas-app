import { auth } from "@clerk/nextjs/server";

import { saveStyleReference } from "@/lib/vision/style-reference-store";
import { createVisionStyleMemoryCandidates } from "@/lib/memory-apply/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    choice?: unknown;
    signals?: unknown;
    sourceAttachmentIds?: unknown;
    note?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const choice = body.choice;
  if (
    choice !== "session_only" &&
    choice !== "profile_save" &&
    choice !== "discard"
  ) {
    return Response.json({ error: "choice が不正です" }, { status: 400 });
  }

  if (choice === "discard") {
    return Response.json({ ok: true, saved: false });
  }

  if (!body.signals || typeof body.signals !== "object") {
    return Response.json({ error: "signals が必要です" }, { status: 400 });
  }

  const signals = body.signals as Parameters<typeof saveStyleReference>[0]["signals"];
  const sourceAttachmentIds = Array.isArray(body.sourceAttachmentIds)
    ? body.sourceAttachmentIds.filter((id): id is string => typeof id === "string")
    : [];
  const note = typeof body.note === "string" ? body.note : null;

  const record = await saveStyleReference({
    userId,
    choice,
    signals,
    sourceAttachmentIds,
    note,
  });

  let candidateIds: string[] = [];
  if (choice === "profile_save") {
    // Durable Personal Memory candidates — never auto-activate / never User Profile core.
    const created = await createVisionStyleMemoryCandidates({
      userId,
      signals,
      sourceAttachmentIds,
      note,
    });
    candidateIds = created.candidateIds;
  }

  return Response.json({
    ok: true,
    saved: Boolean(record),
    // Never auto-merge into User Profile core from this endpoint.
    profilePendingApproval: choice === "profile_save",
    personalMemoryCandidateIds: candidateIds,
    id: record?.id ?? null,
  });
}
