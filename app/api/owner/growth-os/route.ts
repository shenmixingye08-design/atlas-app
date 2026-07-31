import { NextResponse } from "next/server";

import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getGrowthOsSnapshot } from "@/lib/owner/growth-os";

export const dynamic = "force-dynamic";

/** CEO Growth OS — 3 metrics only. */
export async function GET() {
  await requireAtlasOwner();
  return NextResponse.json(getGrowthOsSnapshot());
}
