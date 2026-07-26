import { NextResponse } from "next/server";

import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getExecutiveDashboardSnapshot } from "@/lib/owner/executive";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAtlasOwner();
  const snapshot = await getExecutiveDashboardSnapshot("month");
  return NextResponse.json({
    rows: snapshot.apiCostLog,
    generatedAt: snapshot.generatedAt,
  });
}
