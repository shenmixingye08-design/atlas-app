import { getArtifactTemplate, listArtifactTemplates } from "./registry";
import type {
  ArtifactTemplateDefinition,
  ArtifactTemplateId,
  TemplateMatchContext,
} from "./types";
import { DEFAULT_ARTIFACT_TEMPLATE } from "./types";

export type TemplateSelection = {
  template: ArtifactTemplateDefinition;
  score: number;
  reason: string;
};

function scoreTemplate(
  template: ArtifactTemplateDefinition,
  ctx: TemplateMatchContext,
  haystack: string,
): number {
  let score = 0;

  if (template.preferredArtifactTypes.includes(ctx.artifactType)) {
    score += template.baseWeight + 4;
  }

  for (const pattern of template.patterns) {
    if (pattern.test(haystack)) {
      score += template.baseWeight;
    }
  }

  return score;
}

/**
 * Select the best template via registry scoring.
 * Extensible: add definitions to the registry — no new switch branches required.
 */
export function selectArtifactTemplate(
  ctx: TemplateMatchContext,
  override?: ArtifactTemplateId,
): TemplateSelection {
  if (override) {
    const template = getArtifactTemplate(override);
    return {
      template,
      score: 100,
      reason: "user_selected",
    };
  }

  const haystack = [ctx.assignment, ctx.title, ctx.content]
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
    .slice(0, 12_000);

  let best: TemplateSelection = {
    template: getArtifactTemplate(DEFAULT_ARTIFACT_TEMPLATE),
    score: 0,
    reason: "default",
  };

  for (const template of listArtifactTemplates()) {
    const score = scoreTemplate(template, ctx, haystack);
    if (score > best.score) {
      best = {
        template,
        score,
        reason: `matched:${template.id}`,
      };
    }
  }

  // Artifact-type fallbacks when no pattern scored.
  if (best.score === 0) {
    if (ctx.artifactType === "invoice" || ctx.artifactType === "ranking") {
      return {
        template: getArtifactTemplate("table_focus"),
        score: 3,
        reason: `type_fallback:${ctx.artifactType}`,
      };
    }
    if (ctx.artifactType === "proposal" || ctx.artifactType === "plan") {
      return {
        template: getArtifactTemplate("proposal"),
        score: 3,
        reason: `type_fallback:${ctx.artifactType}`,
      };
    }
    if (ctx.artifactType === "report" || ctx.artifactType === "research") {
      return {
        template: getArtifactTemplate("report"),
        score: 3,
        reason: `type_fallback:${ctx.artifactType}`,
      };
    }
    if (ctx.artifactType === "sns" || ctx.artifactType === "blog") {
      return {
        template: getArtifactTemplate("simple"),
        score: 2,
        reason: `type_fallback:${ctx.artifactType}`,
      };
    }
  }

  return best;
}
