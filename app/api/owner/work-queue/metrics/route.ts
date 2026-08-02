import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getWorkQueueStore } from "@/lib/work-queue";

export async function GET(): Promise<Response> {
  try {
    await requireAtlasOwner();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const metrics = await getWorkQueueStore().metrics();
  return Response.json(metrics);
}
