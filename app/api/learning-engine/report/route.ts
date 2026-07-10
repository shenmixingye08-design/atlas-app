import { auth } from "@clerk/nextjs/server";

import {
  getLatestLearningReport,
  runLearningAnalysis,
} from "@/lib/learning-engine/service";
import {
  LEARNING_ANALYSIS_PERIODS,
  type LearningAnalysisPeriod,
} from "@/lib/learning-engine/types";

function parsePeriod(value: string | null): LearningAnalysisPeriod | null {
  const num = Number(value);
  if (LEARNING_ANALYSIS_PERIODS.includes(num as LearningAnalysisPeriod)) {
    return num as LearningAnalysisPeriod;
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const periodDays = parsePeriod(url.searchParams.get("periodDays"));
  if (!periodDays) {
    return Response.json({ error: "periodDays is required (30|90|180|365)" }, { status: 400 });
  }

  const report = getLatestLearningReport(userId, periodDays);
  return Response.json({ report });
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { periodDays?: unknown };
  try {
    body = (await request.json()) as { periodDays?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const periodDays = parsePeriod(String(body.periodDays ?? ""));
  if (!periodDays) {
    return Response.json(
      { error: "periodDays must be one of 30, 90, 180, 365" },
      { status: 400 },
    );
  }

  const report = runLearningAnalysis(userId, { periodDays });
  return Response.json({ report });
}
