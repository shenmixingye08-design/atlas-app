import { auth } from "@clerk/nextjs/server";

import {
  assertCanMutateFeedback,
  canReadArtifactFeedback,
  clearFeedbackFromBenchmark,
  deleteUserArtifactFeedback,
  getUserArtifactFeedback,
  syncFeedbackToBenchmark,
  upsertArtifactFeedback,
  type ArtifactRatingType,
} from "@/lib/artifact-feedback";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { listBenchmarkRecords } from "@/lib/quality-engine/benchmark";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function assertArtifactAccess(artifactId: string, userId: string): boolean {
  // Soft ownership: allow if stored for user, or no other user's benchmark owns it.
  const stored = getStoredDeliverableForUser(artifactId, userId);
  if (stored) return true;
  const foreign = listBenchmarkRecords(500).some(
    (r) => r.artifactId === artifactId && r.userId && r.userId !== userId,
  );
  return !foreign;
}

/**
 * User thumbs feedback for a deliverable.
 * - Users may create/read/update/delete only their own feedback.
 * - No extra LLM. Does not block generation.
 */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: artifactId } = await context.params;
  const url = new URL(request.url);
  const asUserId = url.searchParams.get("asUserId");
  if (asUserId && asUserId !== userId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const mine = getUserArtifactFeedback(userId, artifactId);
  if (
    mine &&
    !canReadArtifactFeedback({
      viewerUserId: userId,
      feedbackUserId: mine.userId,
      isOwner: false,
    })
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  return Response.json({
    feedback: mine,
    ratingType: mine?.ratingType ?? null,
    status: mine ? "rated" : "unrated",
  });
}

type Body = {
  ratingType?: ArtifactRatingType;
  positiveReasons?: string[];
  negativeReasons?: string[];
  comment?: string | null;
  artifactType?: string | null;
  artifactSubType?: string | null;
  qualityScore?: number | null;
  model?: string | null;
  promptVersion?: string | null;
  jobId?: string | null;
  asUserId?: string;
  source?: "user" | "owner" | "benchmark";
};

async function upsertFromBody(
  artifactId: string,
  userId: string,
  body: Body,
): Promise<Response> {
  if (body.asUserId && body.asUserId !== userId) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    assertCanMutateFeedback({
      viewerUserId: userId,
      targetUserId: userId,
    });
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  if (!assertArtifactAccess(artifactId, userId)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  if (body.ratingType !== "positive" && body.ratingType !== "negative") {
    return Response.json({ error: "invalid_rating_type" }, { status: 400 });
  }

  // Mutual exclusion: never store both reason sets for opposite rating.
  const record = upsertArtifactFeedback({
    artifactId,
    userId,
    jobId: body.jobId,
    ratingType: body.ratingType,
    positiveReasons:
      body.ratingType === "positive" ? (body.positiveReasons ?? []) : [],
    negativeReasons:
      body.ratingType === "negative" ? (body.negativeReasons ?? []) : [],
    comment: body.comment,
    artifactType: body.artifactType,
    artifactSubType: body.artifactSubType,
    qualityScore: body.qualityScore,
    model: body.model,
    promptVersion: body.promptVersion,
    source: body.source === "owner" || body.source === "benchmark" ? "user" : "user",
  });

  syncFeedbackToBenchmark(record);

  return Response.json({
    feedback: record,
    message: "評価ありがとうございます",
  });
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: artifactId } = await context.params;
  const body = (await request.json()) as Body;
  return upsertFromBody(artifactId, userId, body);
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: artifactId } = await context.params;
  const body = (await request.json()) as Body;
  const existing = getUserArtifactFeedback(userId, artifactId);
  if (!existing) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return upsertFromBody(artifactId, userId, {
    ...body,
    ratingType: body.ratingType ?? existing.ratingType,
    positiveReasons: body.positiveReasons ?? [...existing.positiveReasons],
    negativeReasons: body.negativeReasons ?? [...existing.negativeReasons],
    comment: body.comment !== undefined ? body.comment : existing.comment,
  });
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: artifactId } = await context.params;
  const ok = deleteUserArtifactFeedback(userId, artifactId);
  if (ok) clearFeedbackFromBenchmark(artifactId, userId);
  return Response.json({ deleted: ok, status: "unrated" });
}
