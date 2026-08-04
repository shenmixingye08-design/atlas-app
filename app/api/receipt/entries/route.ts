import { auth } from "@clerk/nextjs/server";

import { listHouseholdEntries } from "@/lib/receipt";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const entries = await listHouseholdEntries(userId);
  return Response.json({ entries });
}
