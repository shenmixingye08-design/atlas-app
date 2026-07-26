import { auth } from "@clerk/nextjs/server";

import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  listAllArtifactFeedback,
  upsertArtifactFeedback,
  type ArtifactRatingType,
} from "@/lib/artifact-feedback";
import { syncFeedbackToBenchmark } from "@/lib/artifact-feedback/sync-benchmark";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Owner can attach an owner-sourced rating onto an artifact.
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  await requireAtlasOwner();
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    artifactId?: string;
    ratingType?: ArtifactRatingType;
    comment?: string | null;
    positiveReasons?: string[];
    negativeReasons?: string[];
  };

  const existing = listAllArtifactFeedback(2000).find((r) => r.id === id);
  const artifactId = body.artifactId ?? existing?.artifactId;
  if (!artifactId) {
    return Response.json({ error: "artifact_required" }, { status: 400 });
  }
  if (body.ratingType !== "positive" && body.ratingType !== "negative") {
    return Response.json({ error: "invalid_rating_type" }, { status: 400 });
  }

  const record = upsertArtifactFeedback({
    artifactId,
    userId,
    ratingType: body.ratingType,
    comment: body.comment ?? existing?.comment ?? null,
    positiveReasons:
      body.ratingType === "positive"
        ? (body.positiveReasons ?? [...(existing?.positiveReasons ?? [])])
        : [],
    negativeReasons:
      body.ratingType === "negative"
        ? (body.negativeReasons ?? [...(existing?.negativeReasons ?? [])])
        : [],
    artifactType: existing?.artifactType,
    qualityScore: existing?.qualityScore,
    model: existing?.model,
    promptVersion: existing?.promptVersion,
    source: "owner",
  });
  syncFeedbackToBenchmark(record);

  return Response.json({ feedback: record });
}
