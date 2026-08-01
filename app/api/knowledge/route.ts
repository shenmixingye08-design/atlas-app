import { auth } from "@clerk/nextjs/server";

import { knowledgeService } from "@/lib/knowledge/knowledge-service";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await knowledgeService.list({ userId });
  return Response.json({ entries, total: entries.length });
}
