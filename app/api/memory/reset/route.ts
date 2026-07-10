import { auth } from "@clerk/nextjs/server";

import { resetUserMemories } from "@/lib/user-memory/service";
import type { MemoryCategory, MemoryResetInput } from "@/lib/user-memory/types";
import { MEMORY_CATEGORIES } from "@/lib/user-memory/types";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: MemoryResetInput = {};
  try {
    body = (await request.json()) as MemoryResetInput;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.category && !MEMORY_CATEGORIES.includes(body.category as MemoryCategory)) {
    return Response.json({ error: "Invalid category" }, { status: 400 });
  }

  const deleted = resetUserMemories(
    userId,
    body.all ? undefined : body.category,
  );

  return Response.json({ deleted });
}
