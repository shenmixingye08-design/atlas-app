import { auth } from "@clerk/nextjs/server";

import { resetWorkMemories } from "@/lib/work-memory/service";
import type { WorkMemoryResetInput } from "@/lib/work-memory/types";
import { WORK_MEMORY_TYPES } from "@/lib/work-memory/types";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: WorkMemoryResetInput = {};
  try {
    body = (await request.json()) as WorkMemoryResetInput;
  } catch {
    body = {};
  }

  if (body.all) {
    return Response.json({ deleted: resetWorkMemories(userId) });
  }

  if (body.type && WORK_MEMORY_TYPES.includes(body.type)) {
    return Response.json({ deleted: resetWorkMemories(userId, body.type) });
  }

  return Response.json({ deleted: resetWorkMemories(userId) });
}
