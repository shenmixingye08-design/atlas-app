import { auth } from "@clerk/nextjs/server";

import {
  updateLedgerEntryCategory,
  type ReceiptCategory,
} from "@/lib/receipt";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  let body: { category?: ReceiptCategory };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.category) {
    return Response.json({ error: "category が必要です" }, { status: 400 });
  }
  const entry = await updateLedgerEntryCategory({
    userId,
    entryId: id,
    category: body.category,
  });
  if (!entry) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ entry });
}
