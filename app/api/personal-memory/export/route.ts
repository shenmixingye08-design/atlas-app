import { auth } from "@clerk/nextjs/server";

import { exportPersonalMemories } from "@/lib/personal-memory/service";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = await exportPersonalMemories(userId);
  return Response.json(payload);
}
