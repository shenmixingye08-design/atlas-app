import { auth } from "@clerk/nextjs/server";

import { ensureLearningHydrated } from "@/lib/learning-engine/durable";
import { listUserLearningReports } from "@/lib/learning-engine/service";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureLearningHydrated(userId);
  return Response.json({ reports: listUserLearningReports(userId) });
}
