import { auth } from "@clerk/nextjs/server";

import {
  deleteHouseholdLedgerEntry,
  updateHouseholdLedgerEntry,
  updateLedgerEntryCategory,
  type ReceiptCategory,
} from "@/lib/receipt";
import type { LedgerEntry } from "@/lib/receipt/types";

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
  let body: Partial<
    Pick<
      LedgerEntry,
      | "category"
      | "storeName"
      | "itemName"
      | "note"
      | "amountInclTax"
      | "date"
      | "quantity"
      | "unitPrice"
      | "tax"
      | "paymentMethod"
      | "moneyUse"
    >
  >;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Backward-compatible category-only updates.
  if (body.category && Object.keys(body).length === 1) {
    const entry = await updateLedgerEntryCategory({
      userId,
      entryId: id,
      category: body.category as ReceiptCategory,
    });
    if (!entry) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ entry });
  }

  const entry = await updateHouseholdLedgerEntry({
    userId,
    entryId: id,
    patch: body,
  });
  if (!entry) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ entry });
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const deleted = await deleteHouseholdLedgerEntry({
    userId,
    entryId: id,
  });
  if (!deleted) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ ok: true, deleted: true });
}
