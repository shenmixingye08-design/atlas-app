import { auth } from "@clerk/nextjs/server";

import {
  listBenchmarkRecords,
  listFeedbackForUser,
  saveFeedback,
  updateBenchmarkRecord,
  type UserEvaluation,
  type UserRatingLabel,
} from "@/lib/quality-engine/benchmark";
export const dynamic = "force-dynamic";

const LABEL_SCORE: Record<UserRatingLabel, number> = {
  very_good: 100,
  good: 80,
  ok: 60,
  needs_improvement: 30,
};

/**
 * User feedback for a deliverable.
 * - Users may create/read only their own feedback.
 * - Owners may read aggregate via owner APIs, not this route's cross-user list.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: artifactId } = await context.params;
  const mine = listFeedbackForUser(userId).filter(
    (f) => f.artifactId === artifactId,
  );
  return Response.json({ feedback: mine });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: artifactId } = await context.params;
  const body = (await request.json()) as {
    label?: UserRatingLabel;
    reasons?: string[];
    otherText?: string;
    /** Attempt to read another user's feedback — always denied. */
    asUserId?: string;
  };

  if (body.asUserId && body.asUserId !== userId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  if (!body.label || !(body.label in LABEL_SCORE)) {
    return Response.json({ error: "invalid_label" }, { status: 400 });
  }

  const evaluation: UserEvaluation = {
    label: body.label,
    score: LABEL_SCORE[body.label],
    reasons: body.reasons ?? [],
    otherText: body.otherText?.trim() || null,
    ratedAt: new Date().toISOString(),
  };

  const feedbackId = saveFeedback({
    artifactId,
    userId,
    role: "user",
    payload: evaluation,
  });

  const related = listBenchmarkRecords(200).find(
    (r) => r.artifactId === artifactId && r.userId === userId,
  );
  if (related) {
    updateBenchmarkRecord(related.id, {
      userEvaluation: evaluation,
      usageInfo: {
        ...related.usageInfo,
        userRating: evaluation.score,
        userFeedback: evaluation.otherText,
      },
    });
  }

  return Response.json({ id: feedbackId, evaluation });
}
