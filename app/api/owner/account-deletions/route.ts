import {
  listOwnerAccountDeletions,
  purgeDueAccountDeletions,
} from "@/lib/account-deletion";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  const rows = await listOwnerAccountDeletions();
  return Response.json({
    rows,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(request: Request): Promise<Response> {
  await requireAtlasOwner();

  let body: { action?: unknown } = {};
  try {
    body = (await request.json()) as { action?: unknown };
  } catch {
    // empty body ok for purge-due
  }

  if (body.action === "purge_due" || body.action === undefined) {
    const result = await purgeDueAccountDeletions();
    return Response.json(result);
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
