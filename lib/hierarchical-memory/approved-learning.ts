import type { Deliverable } from "@/lib/orchestration/deliverable-types";

import { saveHierarchicalMemory } from "./service";
import type { HierarchicalMemoryRecord, MemoryResolveContext } from "./types";

/**
 * Learn compact style/format patterns from approved / adopted deliverables.
 * Never stores the full deliverable body in permanent prompts.
 */
export function learnFromApprovedDeliverable(input: {
  userId: string;
  assignment: string;
  deliverable: Deliverable;
  projectId?: string | null;
  jobId?: string | null;
  automationId?: string | null;
}): HierarchicalMemoryRecord[] {
  const body = (
    input.deliverable.content ||
    input.deliverable.markdown ||
    input.deliverable.plainText ||
    ""
  ).trim();
  if (body.length < 40) return [];

  const context: MemoryResolveContext = {
    userId: input.userId,
    assignment: input.assignment,
    projectId: input.projectId,
    jobId: input.jobId,
    automationId: input.automationId,
  };

  const saved: HierarchicalMemoryRecord[] = [];
  const lengthBand =
    body.length < 200 ? "短め" : body.length < 800 ? "標準" : "長め";
  saved.push(
    saveHierarchicalMemory(input.userId, {
      scope: context.jobId || context.automationId ? "job" : "user",
      category: "style",
      key: `approved_length_${input.deliverable.type}`,
      value: `${input.deliverable.type}は${lengthBand}の分量を好みとして採用`,
      source: "approved_output",
      confidence: 0.7,
      isTemporary: false,
      expiresAt: null,
      projectId: context.projectId ?? null,
      jobId: context.jobId ?? null,
      automationId: context.automationId ?? null,
    }),
  );

  if (/です|ます|ございます/.test(body) && !/だよ|だね|っす/.test(body)) {
    saved.push(
      saveHierarchicalMemory(input.userId, {
        scope: "user",
        category: "writing",
        key: "tone",
        value: "丁寧な敬語トーンを採用",
        source: "approved_output",
        confidence: 0.65,
        isTemporary: false,
        expiresAt: null,
        projectId: null,
        jobId: null,
        automationId: null,
      }),
    );
  }

  if (input.deliverable.type === "social_post") {
    const hashtagCount = (body.match(/#/g) ?? []).length;
    saved.push(
      saveHierarchicalMemory(input.userId, {
        scope: "user",
        category: "sns",
        key: "hashtag_policy",
        value: `ハッシュタグは最大${Math.min(3, Math.max(0, hashtagCount))}個程度`,
        source: "approved_output",
        confidence: 0.6,
        isTemporary: false,
        expiresAt: null,
        projectId: null,
        jobId: null,
        automationId: null,
      }),
    );
  }

  return saved;
}
