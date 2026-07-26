import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  filterArtifactFeedback,
  listAllArtifactFeedback,
  toCsv,
  toExportRows,
  type ArtifactFeedbackFilters,
  type ArtifactRatingType,
} from "@/lib/artifact-feedback";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const filters: ArtifactFeedbackFilters = {
    ratingType: (url.searchParams.get("ratingType") as
      | ArtifactRatingType
      | "all"
      | null) ?? "all",
    artifactType: url.searchParams.get("artifactType"),
  };
  const records = filterArtifactFeedback(
    listAllArtifactFeedback(2000),
    filters,
  );
  const rows = toExportRows(records);

  if (format === "json") {
    return Response.json({
      rows,
      note: "PII and artifact body excluded by default",
    });
  }

  const csv = toCsv(rows);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="artifact-feedback.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
