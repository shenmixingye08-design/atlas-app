import { auth } from "@clerk/nextjs/server";

import { previewWorkMemoriesForAssignment } from "@/lib/work-memory/service";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const assignment = url.searchParams.get("assignment")?.trim();
  if (!assignment) {
    return Response.json({ error: "assignment is required" }, { status: 400 });
  }

  return Response.json({
    used: previewWorkMemoriesForAssignment(userId, assignment),
  });
}
