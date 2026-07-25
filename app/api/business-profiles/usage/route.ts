import { auth } from "@clerk/nextjs/server";

import { businessProfileRepository } from "@/lib/business-profile/repository";

/** List profile usage history for the signed-in user (field keys only, no values). */
export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logs = await businessProfileRepository.listUsageLogs(userId);
  return Response.json({
    logs: logs
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100),
  });
}
