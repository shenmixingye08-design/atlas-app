import { auth } from "@clerk/nextjs/server";
import { buildMemoryPreview } from "@/lib/personal-memory/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    notes?: string;
    currentInstruction?: Record<string, unknown>;
    artifactTypes?: string[];
    automationId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const preview = await buildMemoryPreview({
    userId,
    notes: body.notes,
    currentInstruction: body.currentInstruction,
    artifactTypes: body.artifactTypes,
    automationId: body.automationId,
  });

  return Response.json(preview, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
