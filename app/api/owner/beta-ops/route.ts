import { NextResponse } from "next/server";

import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  appendBetaImprovement,
  getBetaOpsSnapshot,
} from "@/lib/owner/beta-ops";

export const dynamic = "force-dynamic";

/** CEO β service-state KPIs — today / week / month. */
export async function GET() {
  await requireAtlasOwner();
  return NextResponse.json(getBetaOpsSnapshot());
}

/** Record an evidence-based improvement entry (ops only). */
export async function POST(request: Request) {
  await requireAtlasOwner();
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    evidence?: string;
    period?: "today" | "week" | "month" | "adhoc";
  };
  if (!body.title?.trim() || !body.evidence?.trim()) {
    return NextResponse.json(
      { error: "title and evidence are required" },
      { status: 400 },
    );
  }
  const entry = appendBetaImprovement({
    title: body.title.trim(),
    evidence: body.evidence.trim(),
    period: body.period,
  });
  return NextResponse.json({ ok: true, entry, snapshot: getBetaOpsSnapshot() });
}
