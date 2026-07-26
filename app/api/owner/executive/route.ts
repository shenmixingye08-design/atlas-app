import { NextResponse } from "next/server";

import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  getExecutiveDashboardSnapshot,
  type ExecutivePeriod,
} from "@/lib/owner/executive";

export const dynamic = "force-dynamic";

function parsePeriod(value: string | null): ExecutivePeriod {
  if (
    value === "today" ||
    value === "week" ||
    value === "month" ||
    value === "year"
  ) {
    return value;
  }
  return "month";
}

export async function GET(request: Request) {
  await requireAtlasOwner();
  const { searchParams } = new URL(request.url);
  const period = parsePeriod(searchParams.get("period"));
  const snapshot = await getExecutiveDashboardSnapshot(period);
  return NextResponse.json(snapshot);
}
