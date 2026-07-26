import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  filterArtifactFeedback,
  listAllArtifactFeedback,
  sortArtifactFeedback,
  type ArtifactFeedbackFilters,
  type ArtifactFeedbackSort,
  type ArtifactRatingType,
} from "@/lib/artifact-feedback";

export const dynamic = "force-dynamic";

function parseBool(v: string | null): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();
  const url = new URL(request.url);
  const filters: ArtifactFeedbackFilters = {
    ratingType: (url.searchParams.get("ratingType") as
      | ArtifactRatingType
      | "all"
      | null) ?? "all",
    artifactType: url.searchParams.get("artifactType"),
    userId: url.searchParams.get("userId"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    model: url.searchParams.get("model"),
    promptVersion: url.searchParams.get("promptVersion"),
    templateId: url.searchParams.get("templateId"),
    knowledgeVersion: url.searchParams.get("knowledgeVersion"),
    qualityScoreMin: url.searchParams.get("qualityScoreMin")
      ? Number(url.searchParams.get("qualityScoreMin"))
      : null,
    qualityScoreMax: url.searchParams.get("qualityScoreMax")
      ? Number(url.searchParams.get("qualityScoreMax"))
      : null,
    hasRegeneration: parseBool(url.searchParams.get("hasRegeneration")),
    hasComment: parseBool(url.searchParams.get("hasComment")),
    downloaded: parseBool(url.searchParams.get("downloaded")),
    finalUsed: parseBool(url.searchParams.get("finalUsed")),
  };
  const sort = (url.searchParams.get("sort") as ArtifactFeedbackSort) || "newest";
  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? "200") || 200,
    2000,
  );

  const all = listAllArtifactFeedback(limit);
  const filtered = sortArtifactFeedback(
    filterArtifactFeedback(all, filters),
    sort,
  );

  return Response.json({
    records: filtered,
    count: filtered.length,
  });
}
