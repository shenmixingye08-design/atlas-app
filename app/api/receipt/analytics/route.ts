import { auth } from "@clerk/nextjs/server";

import { getHouseholdAnalytics } from "@/lib/receipt";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const yearMonth =
    url.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const analytics = await getHouseholdAnalytics(userId, yearMonth);
  return Response.json({ analytics });
}
