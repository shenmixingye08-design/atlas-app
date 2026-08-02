import { auth } from "@clerk/nextjs/server";

import { listMemoryImprovementSuggestions } from "@/lib/personal-memory/service";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const suggestions = await listMemoryImprovementSuggestions(userId);
    return Response.json({ suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "suggestions_failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
