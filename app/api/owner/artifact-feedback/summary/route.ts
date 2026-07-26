import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  buildArtifactFeedbackSummary,
  buildImprovementCandidates,
  buildOwnerFeedbackNotices,
  detectQualityUserDivergence,
  groupPositiveRateBy,
  listAllArtifactFeedback,
  rankReasons,
} from "@/lib/artifact-feedback";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();
  const records = listAllArtifactFeedback(2000);
  const summary = buildArtifactFeedbackSummary(records);

  return Response.json({
    summary,
    positiveReasonRanking: rankReasons(records, "positive"),
    negativeReasonRanking: rankReasons(records, "negative"),
    byArtifactType: groupPositiveRateBy(records, (r) => r.artifactType),
    byModel: groupPositiveRateBy(records, (r) => r.model),
    byPromptVersion: groupPositiveRateBy(records, (r) => r.promptVersion),
    byTemplate: groupPositiveRateBy(
      records,
      (r) => r.templateId ?? r.templateVersion,
    ),
    byKnowledgeVersion: groupPositiveRateBy(
      records,
      (r) => r.knowledgeVersion,
    ),
    bySmartContext: groupPositiveRateBy(records, (r) => {
      if (!r.smartContextVersion) return null;
      return r.smartContextVersion === "off" ? "OFF" : "ON";
    }),
    divergence: detectQualityUserDivergence(records),
    improvements: buildImprovementCandidates(records),
    notices: buildOwnerFeedbackNotices(records),
    dataStatus: records.length === 0 ? "insufficient_data" : summary.dataStatus,
  });
}
