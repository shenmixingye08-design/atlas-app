import { NextResponse } from "next/server";

import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  getLaunchVerdictSnapshot,
  recordNpsResponse,
} from "@/lib/owner/launch-verdict";

export const dynamic = "force-dynamic";

/** CEO 正式公開判定 — 実測KPIのみ。 */
export async function GET() {
  await requireAtlasOwner();
  return NextResponse.json(getLaunchVerdictSnapshot());
}

/** NPS 実測の記録（運営入力）。スコア 0–10 のみ。 */
export async function POST(request: Request) {
  await requireAtlasOwner();
  const body = (await request.json().catch(() => ({}))) as {
    score?: number;
    cohort?: string;
  };
  if (
    typeof body.score !== "number" ||
    !Number.isInteger(body.score) ||
    body.score < 0 ||
    body.score > 10
  ) {
    return NextResponse.json(
      { error: "score must be an integer 0–10" },
      { status: 400 }
    );
  }
  const row = recordNpsResponse({
    score: body.score,
    cohort: body.cohort,
  });
  return NextResponse.json({
    ok: true,
    response: row,
    snapshot: getLaunchVerdictSnapshot(),
  });
}
