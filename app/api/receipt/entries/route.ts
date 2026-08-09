import { auth } from "@clerk/nextjs/server";

import {
  createManualLedgerEntry,
  listHouseholdEntries,
  type ReceiptCategory,
} from "@/lib/receipt";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const fromDate = url.searchParams.get("from") ?? undefined;
  const toDate = url.searchParams.get("to") ?? undefined;
  const limit = limitRaw != null ? Number(limitRaw) : undefined;
  const offset = offsetRaw != null ? Number(offsetRaw) : undefined;
  const entries = await listHouseholdEntries(userId, {
    limit: Number.isFinite(limit) ? limit : undefined,
    offset: Number.isFinite(offset) ? offset : undefined,
    fromDate,
    toDate,
  });
  return Response.json({ entries });
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    amountInclTax?: number;
    date?: string;
    category?: ReceiptCategory;
    storeName?: string;
    itemName?: string;
    note?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    typeof body.amountInclTax !== "number" ||
    !body.date ||
    !body.category
  ) {
    return Response.json(
      { error: "amountInclTax, date, category が必要です" },
      { status: 400 },
    );
  }
  const entry = await createManualLedgerEntry({
    userId,
    amountInclTax: body.amountInclTax,
    date: body.date,
    category: body.category,
    storeName: body.storeName,
    itemName: body.itemName,
    note: body.note,
  });
  return Response.json({ entry }, { status: 201 });
}
