import type { LearningDomain } from "@/lib/learning-engine/types";

import type { ArtifactType } from "./types";

/**
 * Map artifact types onto Learning Engine domains.
 * Read-only bridge — does not mutate User Profile or Learning cores.
 */
export function artifactTypeToLearningDomain(
  artifactType: ArtifactType,
): LearningDomain {
  switch (artifactType) {
    case "sales_material":
    case "presentation":
    case "proposal":
      return "sales_material";
    case "household":
    case "invoice":
      return "bookkeeping";
    case "sns":
      return "social_post";
    case "blog":
    case "report":
    case "plan":
    case "contract":
    case "minutes":
    case "manual":
    case "research":
    case "ranking":
    case "list":
    case "schedule":
      return "document_creation";
    default:
      return "general_work";
  }
}

/** Hint payload for UI / future learning assist hooks. */
export type ArtifactLearningHint = {
  domain: LearningDomain;
  artifactType: ArtifactType;
  suggestRememberTemplate: boolean;
  message: string;
};

export function buildArtifactLearningHint(
  artifactType: ArtifactType,
): ArtifactLearningHint {
  const domain = artifactTypeToLearningDomain(artifactType);
  const suggestRememberTemplate =
    artifactType !== "sns" && artifactType !== "general";

  return {
    domain,
    artifactType,
    suggestRememberTemplate,
    message: suggestRememberTemplate
      ? "この成果物の構成を学習アシストへ連携すると、次回から同じ型で仕上げやすくなります。"
      : "必要に応じて学習アシストで振り返りを残せます。",
  };
}
