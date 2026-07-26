import { NextResponse } from "next/server";

import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  getAiAssistantSnapshot,
  type AssistantPeriod,
} from "@/lib/owner/ai-assistant";

export const dynamic = "force-dynamic";

function parsePeriod(value: string | null): AssistantPeriod {
  if (value === "day" || value === "week" || value === "month") return value;
  return "month";
}

export async function GET(request: Request) {
  await requireAtlasOwner();
  const { searchParams } = new URL(request.url);
  const period = parsePeriod(searchParams.get("period"));
  const refreshAi = searchParams.get("refreshAi") === "1";
  const snapshot = await getAiAssistantSnapshot({ period, refreshAi });
  return NextResponse.json(snapshot);
}

/** Owner-triggered AI re-analysis (approval-after-click). */
export async function POST(request: Request) {
  await requireAtlasOwner();
  const body = (await request.json().catch(() => null)) as {
    period?: unknown;
  } | null;
  const period = parsePeriod(
    typeof body?.period === "string" ? body.period : null,
  );
  const snapshot = await getAiAssistantSnapshot({
    period,
    refreshAi: true,
  });
  return NextResponse.json(snapshot);
}
