import type { OrchestrationResult } from "@/lib/orchestration/types";
import { generateGrowthReview } from "@/lib/growth";
import { generatePrReview, isCeoApprovedForPr } from "@/lib/pr";
import { ui } from "@/lib/i18n";

import {
  LEARNING_EXTENSION_STUBS,
  type CompanyLearning,
  type LearningConfidence,
  type LearningRecord,
} from "./types";

function deriveWorkflowTopic(result: OrchestrationResult): string {
  const firstLine = result.assignment.split("\n")[0]?.trim();
  if (firstLine && firstLine.length <= 48) {
    return firstLine.replace(/[。．.!！?？]+$/, "");
  }
  return ui.learning.workflowDefault;
}

function pushRecord(
  records: LearningRecord[],
  record: Omit<LearningRecord, "id">,
): void {
  records.push({
    id: `learning-${records.length + 1}`,
    ...record,
  });
}

function addBlogSeoLearning(
  records: LearningRecord[],
  workflow: string,
): void {
  pushRecord(records, {
    workedWell: ui.learning.workedBlogSeo,
    didNotWorkWell: null,
    recommendation: ui.learning.recommendBlogFeatureReleases,
    confidence: "high",
    department: ui.internalComms.deptMarketing,
    departmentId: "marketing",
    workflow,
    topicId: "seo",
    topic: ui.learning.topicMarketing,
  });
}

function addQaFastPathLearning(
  records: LearningRecord[],
  revisionCount: number,
  workflow: string,
): void {
  pushRecord(records, {
    workedWell: ui.learning.workedFastQa(revisionCount),
    didNotWorkWell: null,
    recommendation: ui.learning.recommendFastApprovalPath,
    confidence: "medium",
    department: ui.internalComms.deptQa,
    departmentId: "quality-assurance",
    workflow,
    topicId: "quality",
    topic: ui.learning.topicQuality,
  });
}

function addEmailSequenceLearning(
  records: LearningRecord[],
  workflow: string,
): void {
  pushRecord(records, {
    workedWell: ui.learning.workedEmailSequence,
    didNotWorkWell: null,
    recommendation: ui.learning.recommendEmailAfterBlog,
    confidence: "medium",
    department: ui.internalComms.deptMarketing,
    departmentId: "marketing",
    workflow,
    topicId: "email",
    topic: ui.learning.topicMarketing,
  });
}

function addGrowthImprovementLearning(
  records: LearningRecord[],
  improvement: string,
  weakness: string | null,
  confidence: LearningConfidence,
  workflow: string,
): void {
  pushRecord(records, {
    workedWell: improvement,
    didNotWorkWell: weakness,
    recommendation: improvement,
    confidence,
    department: ui.internalComms.deptGrowthAnalytics,
    departmentId: "marketing",
    workflow,
    topicId: "growth",
    topic: ui.learning.topicGrowth,
  });
}

function addDefaultLearning(
  records: LearningRecord[],
  result: OrchestrationResult,
  workflow: string,
): void {
  const score = result.qualityLoop?.currentScore ?? 0;
  pushRecord(records, {
    workedWell: ui.learning.workedDefault(score),
    didNotWorkWell: null,
    recommendation: ui.learning.recommendDefault,
    confidence: score >= 90 ? "high" : "medium",
    department: ui.internalComms.deptPlanning,
    departmentId: "planning",
    workflow,
    topicId: "workflow",
    topic: ui.learning.topicWorkflow,
  });
}

/** Generate company learning records from a completed workflow. */
export function generateCompanyLearning(
  result: OrchestrationResult,
): CompanyLearning | null {
  if (result.status !== "completed") {
    return null;
  }

  const workflow = deriveWorkflowTopic(result);
  const records: LearningRecord[] = [];
  const prReview = generatePrReview(result);
  const growthReview =
    prReview && prReview.shouldShare
      ? generateGrowthReview(prReview, result)
      : null;

  if (growthReview?.impacts.seoValue === "high") {
    const blogLead = prReview?.strategy?.channelPriority.some(
      (channel) => channel.id === "blog",
    );
    if (blogLead) {
      addBlogSeoLearning(records, workflow);
    }
  }

  if (result.qualityLoop?.ceoApproval?.approved) {
    const revisions = result.qualityLoop.revisionCount;
    if (revisions < 2) {
      addQaFastPathLearning(records, revisions, workflow);
    }
  }

  const strategy = prReview?.strategy;
  if (strategy) {
    const targetsExistingUsers = strategy.audiences.some((audience) =>
      audience.includes(ui.pr.audienceExistingUsers),
    );
    const hasBlog = strategy.channelPriority.some(
      (channel) => channel.id === "blog",
    );
    const hasEmail =
      prReview?.channels.some(
        (channel) => channel.id === "email" && channel.recommended,
      ) ?? false;

    if (targetsExistingUsers && hasBlog && hasEmail) {
      addEmailSequenceLearning(records, workflow);
    }
  }

  if (records.length === 0 && growthReview?.improvements[0]) {
    addGrowthImprovementLearning(
      records,
      growthReview.improvements[0]!,
      growthReview.weaknesses[0] ?? null,
      growthReview.impacts.confidence,
      workflow,
    );
  }

  if (records.length === 0 && isCeoApprovedForPr(result)) {
    addDefaultLearning(records, result, workflow);
  }

  if (records.length === 0) {
    return null;
  }

  return {
    records,
    extensions: LEARNING_EXTENSION_STUBS,
  };
}
