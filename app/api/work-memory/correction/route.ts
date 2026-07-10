import { auth } from "@clerk/nextjs/server";

import { learnFromCorrectionDiff } from "@/lib/work-memory/service";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { before?: string; after?: string; sourceReference?: string };
  try {
    body = (await request.json()) as {
      before?: string;
      after?: string;
      sourceReference?: string;
    };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.before?.trim() || !body.after?.trim()) {
    return Response.json({ error: "before and after are required" }, { status: 400 });
  }

  const candidate = learnFromCorrectionDiff({
    userId,
    before: body.before,
    after: body.after,
    sourceReference: body.sourceReference,
  });

  return Response.json({ candidateCreated: candidate != null, candidate });
}
