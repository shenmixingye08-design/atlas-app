import { detectEmailSubject } from "./email-deliverable";
import type { Deliverable, DeliverableType } from "./deliverable-types";
import { deliverableHasContent } from "./deliverable-types";
import type { OrchestrationStep } from "./types";

/** Core lockdown — minimal CEO → Planner → Worker → Deliverable Builder pipeline. */
export function isCoreTestMode(): boolean {
  return process.env.ATLAS_CORE_TEST === "true";
}

export const CORE_DELIVERABLE_TYPES = [
  "email",
  "social_post",
  "short_document",
] as const;

export type CoreDeliverableType = (typeof CORE_DELIVERABLE_TYPES)[number];

export type CoreStage = "ceo" | "planner_plan" | "worker" | "final_deliverable";

export function isCoreDeliverableType(type: DeliverableType): type is CoreDeliverableType {
  return (CORE_DELIVERABLE_TYPES as readonly string[]).includes(type);
}

/** Classify into one of the three supported core deliverable types. */
export function classifyCoreDeliverableType(assignment: string): CoreDeliverableType {
  const haystack = assignment.toLowerCase();

  if (/営業メール|sales\s*email|セールスメール|提案メール|フォローアップメール|見積メール/.test(assignment)) {
    return "email";
  }
  if (/メール|email|e-mail|mail|gmail|newsletter|メール文|メールを/.test(haystack)) {
    return "email";
  }
  if (/sns|ツイート|twitter|\bx\b|x投稿|social\s*post|投稿文|ソーシャル|投稿を/.test(haystack)) {
    return "social_post";
  }
  return "short_document";
}

export function extractSocialPosts(deliverable: Deliverable): string[] {
  const fromMeta = deliverable.metadata.posts?.filter((p) => p.trim()) ?? [];
  if (fromMeta.length > 0) return fromMeta;

  const source = deliverable.content.trim() || deliverable.markdown.trim();
  if (!source) return [];

  const numbered = [...source.matchAll(/(?:^|\n)(?:#{1,3}\s*)?(?:投稿\s*)?(\d+)[.)：:\s]+([^\n]+(?:\n(?!\d+[.)：:\s])[^\n]+)*)/g)];
  if (numbered.length >= 3) {
    return numbered.map((match) => match[2].trim()).filter(Boolean);
  }

  const blocks = source
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 20);

  return blocks.length >= 3 ? blocks : [];
}

export type CoreDeliverableValidation = {
  valid: boolean;
  renderable: boolean;
  missing: string[];
};

export function validateCoreDeliverable(deliverable: Deliverable): CoreDeliverableValidation {
  const missing: string[] = [];

  if (!deliverableHasContent(deliverable)) {
    missing.push("content");
    return { valid: false, renderable: false, missing };
  }

  switch (deliverable.type) {
    case "email": {
      const subject = detectEmailSubject(deliverable);
      const body =
        deliverable.content.replace(/^件名[:：].+?\n+/i, "").trim() ||
        deliverable.plainText.trim();
      if (!subject.trim()) missing.push("件名");
      if (!body.trim()) missing.push("本文");
      break;
    }
    case "social_post": {
      const posts = extractSocialPosts(deliverable);
      if (posts.length < 3) missing.push("posts (minimum 3)");
      if (posts.length > 5) missing.push("posts (maximum 5)");
      break;
    }
    case "short_document": {
      if (!deliverable.title.trim()) missing.push("title");
      if (!deliverable.content.trim() && !deliverable.markdown.trim()) {
        missing.push("body");
      }
      break;
    }
    default:
      missing.push(`unsupported type: ${deliverable.type}`);
  }

  const valid = missing.length === 0;
  return {
    valid,
    renderable: valid,
    missing,
  };
}

export function canRenderCoreFinalOutput(deliverable: Deliverable): boolean {
  return validateCoreDeliverable(deliverable).renderable;
}

export function coreStageFailureMessage(stage: CoreStage | OrchestrationStep): string {
  return `${stage} が実行されませんでした。`;
}
