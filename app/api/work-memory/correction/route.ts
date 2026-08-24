import { auth } from "@clerk/nextjs/server";

import { ingestEditDiffAsCandidate } from "@/lib/personal-memory/service";
import { persistWorkMemoryNow } from "@/lib/work-memory/durable";
import { ensureWorkMemoryHydrated } from "@/lib/work-memory/durable";
import { learnFromCorrectionDiff } from "@/lib/work-memory/service";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    before?: string;
    after?: string;
    sourceReference?: string;
    artifactType?: string;
  };
  try {
    body = (await request.json()) as {
      before?: string;
      after?: string;
      sourceReference?: string;
      artifactType?: string;
    };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await ensureWorkMemoryHydrated(userId);

  if (!body.before?.trim() || !body.after?.trim()) {
    return Response.json({ error: "before and after are required" }, { status: 400 });
  }

  try {
    await ingestEditDiffAsCandidate({
      userId,
      before: body.before,
      after: body.after,
      artifactType: body.artifactType ?? null,
      reason: "user_edit_diff",
    });
  } catch {
    // Personal Memory ingest is best-effort; Work Memory candidate still records.
  }

  const candidate = learnFromCorrectionDiff({
    userId,
    before: body.before,
    after: body.after,
    sourceReference: body.sourceReference,
    artifactType: body.artifactType ?? null,
  });
  await persistWorkMemoryNow(userId);

  return Response.json({ candidateCreated: candidate != null, candidate });
}
