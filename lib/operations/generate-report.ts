import type { OrchestrationResult } from "@/lib/orchestration/types";
import { generateCompanyLearning } from "@/lib/learning";
import { generateGrowthReview } from "@/lib/growth";
import { generatePrReview, isCeoApprovedForPr } from "@/lib/pr";
import { ui } from "@/lib/i18n";

import {
  OPERATIONS_EXTENSION_STUBS,
  type CompanyOperationsReport,
  type DepartmentHighlight,
  type HealthIndicator,
  type HealthStatus,
} from "./types";

function scoreToHealth(score: number): HealthStatus {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  return "attention";
}

function levelToHealth(
  level: "high" | "medium" | "low" | undefined,
): HealthStatus {
  if (level === "high") return "excellent";
  if (level === "medium") return "good";
  return "attention";
}

function buildTodayStatus(
  result: OrchestrationResult,
  prReview: ReturnType<typeof generatePrReview>,
  learning: ReturnType<typeof generateCompanyLearning>,
): string[] {
  const status: string[] = [ui.ops.statusOperatingNormally];

  const qaScore = result.qualityLoop?.currentScore ?? 0;
  const revisions = result.qualityLoop?.revisionCount ?? 0;

  if (qaScore >= 90) {
    status.push(ui.ops.statusQualityHigh);
  } else if (qaScore >= 75) {
    status.push(ui.ops.statusQualityStable);
  }

  if (revisions <= 1) {
    status.push(ui.ops.statusRevisionsLow);
  } else if (revisions >= 2) {
    status.push(ui.ops.statusRevisionsReduced(revisions));
  }

  const blogLead = prReview?.strategy?.channelPriority[0]?.id === "blog";
  if (blogLead) {
    status.push(ui.ops.statusPrBlogCentric);
  } else if (prReview?.shouldShare) {
    status.push(ui.ops.statusPrActive);
  }

  if (learning && learning.records.length > 0) {
    status.push(ui.ops.statusLearningShared);
  }

  return status.slice(0, 5);
}

function buildCeoHighlight(result: OrchestrationResult): DepartmentHighlight {
  const approved = result.qualityLoop?.ceoApproval?.approved ?? result.approved;
  return {
    id: "ceo",
    label: ui.ops.deptCeo,
    highlight: approved
      ? ui.ops.highlightCeoApproved
      : ui.ops.highlightCeoReviewing,
  };
}

function buildResearchHighlight(result: OrchestrationResult): DepartmentHighlight | null {
  const research = result.research;
  if (!research) return null;

  if (
    research.reportStatus === "skipped" ||
    !research.assessment.required
  ) {
    return {
      id: "research",
      label: ui.ops.deptResearch,
      highlight: ui.ops.highlightResearchSkipped,
    };
  }

  if (research.report) {
    const hasCompetitor = research.assessment.categories.includes(
      "competitor_research",
    );
    return {
      id: "research",
      label: ui.ops.deptResearch,
      highlight: hasCompetitor
        ? ui.ops.highlightResearchCompetitor
        : ui.ops.highlightResearchDone,
    };
  }

  return null;
}

function buildPlannerHighlight(result: OrchestrationResult): DepartmentHighlight | null {
  if (!result.plannerPlan && result.tasks.length === 0) return null;

  if (result.tasks.length > 0) {
    return {
      id: "planner",
      label: ui.ops.deptPlanner,
      highlight: ui.ops.highlightPlannerTasks(result.tasks.length),
    };
  }

  return {
    id: "planner",
    label: ui.ops.deptPlanner,
    highlight: ui.ops.highlightPlannerPlan,
  };
}

function buildWorkerHighlight(result: OrchestrationResult): DepartmentHighlight | null {
  const completed = result.executions.filter(
    (exec) => exec.workerStatus === "completed",
  ).length;

  if (completed === 0) return null;

  return {
    id: "worker",
    label: ui.ops.deptWorker,
    highlight: ui.ops.highlightWorkerDone(completed),
  };
}

function buildQaHighlight(result: OrchestrationResult): DepartmentHighlight | null {
  const loop = result.qualityLoop;
  if (!loop) return null;

  const score = loop.currentScore ?? 0;
  if (score >= 95) {
    return {
      id: "qa",
      label: ui.ops.deptQa,
      highlight: ui.ops.highlightQaScore95,
    };
  }

  if (loop.ceoApproval?.approved) {
    return {
      id: "qa",
      label: ui.ops.deptQa,
      highlight: ui.ops.highlightQaApproved(score),
    };
  }

  return {
    id: "qa",
    label: ui.ops.deptQa,
    highlight: ui.ops.highlightQaReview(score),
  };
}

function buildPrHighlight(
  result: OrchestrationResult,
  prReview: ReturnType<typeof generatePrReview>,
): DepartmentHighlight | null {
  if (!prReview || !isCeoApprovedForPr(result)) return null;
  if (!prReview.shouldShare) {
    return {
      id: "pr",
      label: ui.ops.deptPr,
      highlight: ui.ops.highlightPrInternal,
    };
  }

  const top = prReview.strategy?.channelPriority[0];
  if (top?.id === "blog") {
    return {
      id: "pr",
      label: ui.ops.deptPr,
      highlight: ui.ops.highlightPrBlog,
    };
  }

  return {
    id: "pr",
    label: ui.ops.deptPr,
    highlight: top
      ? ui.ops.highlightPrChannel(top.label)
      : ui.ops.highlightPrPlanning,
  };
}

function buildGrowthHighlight(
  growthReview: ReturnType<typeof generateGrowthReview>,
): DepartmentHighlight | null {
  if (!growthReview) return null;

  const top = growthReview.recommendation.split("。")[0];
  return {
    id: "growth",
    label: ui.ops.deptGrowth,
    highlight: top ? `${top}。` : ui.ops.highlightGrowthDone,
  };
}

function buildLearningHighlight(
  learning: ReturnType<typeof generateCompanyLearning>,
): DepartmentHighlight | null {
  if (!learning || learning.records.length === 0) return null;

  const primary = learning.records[0]?.recommendation;
  return {
    id: "learning",
    label: ui.ops.deptLearning,
    highlight: primary
      ? ui.ops.highlightLearningRecorded(primary)
      : ui.ops.highlightLearningDone,
  };
}

function buildDepartmentHighlights(
  result: OrchestrationResult,
  prReview: ReturnType<typeof generatePrReview>,
  growthReview: ReturnType<typeof generateGrowthReview>,
  learning: ReturnType<typeof generateCompanyLearning>,
): DepartmentHighlight[] {
  const highlights: DepartmentHighlight[] = [buildCeoHighlight(result)];

  const optional = [
    buildResearchHighlight(result),
    buildPlannerHighlight(result),
    buildWorkerHighlight(result),
    buildQaHighlight(result),
    buildPrHighlight(result, prReview),
    buildGrowthHighlight(growthReview),
    buildLearningHighlight(learning),
  ].filter((item): item is DepartmentHighlight => item !== null);

  return [...highlights, ...optional];
}

function buildHealthIndicators(
  result: OrchestrationResult,
  growthReview: ReturnType<typeof generateGrowthReview>,
  learning: ReturnType<typeof generateCompanyLearning>,
): HealthIndicator[] {
  const qaScore = result.qualityLoop?.currentScore ?? 0;
  const revisions = result.qualityLoop?.revisionCount ?? 0;
  const failedTasks = result.executions.some(
    (exec) =>
      exec.workerStatus === "failed" || exec.reviewerStatus === "failed",
  );

  const learningCount = learning?.records.length ?? 0;
  const learningConfidence = learning?.records[0]?.confidence;

  let companyConfidenceScore = qaScore;
  if (result.qualityLoop?.ceoApproval?.approved) companyConfidenceScore += 5;
  if (learningCount > 0) companyConfidenceScore += 3;
  if (revisions <= 1) companyConfidenceScore += 2;
  if (failedTasks) companyConfidenceScore -= 15;

  return [
    {
      id: "quality",
      label: ui.ops.healthQuality,
      status: scoreToHealth(qaScore || (result.approved ? 80 : 60)),
    },
    {
      id: "knowledgeGrowth",
      label: ui.ops.healthKnowledgeGrowth,
      status:
        learningCount >= 2
          ? "excellent"
          : learningCount === 1
            ? "good"
            : "attention",
    },
    {
      id: "automation",
      label: ui.ops.healthAutomation,
      status: failedTasks ? "attention" : revisions <= 1 ? "excellent" : "good",
    },
    {
      id: "learning",
      label: ui.ops.healthLearning,
      status: levelToHealth(learningConfidence),
    },
    {
      id: "companyConfidence",
      label: ui.ops.healthCompanyConfidence,
      status: scoreToHealth(Math.min(companyConfidenceScore, 100)),
    },
  ];
}

function buildCeoDailyReport(
  result: OrchestrationResult,
  learning: ReturnType<typeof generateCompanyLearning>,
): string {
  const approved = result.qualityLoop?.ceoApproval?.approved ?? result.approved;

  if (approved && learning && learning.records.length > 0) {
    return ui.ops.ceoReportSuccessWithLearning;
  }

  if (approved) {
    return ui.ops.ceoReportSuccess;
  }

  if (result.status === "completed") {
    return ui.ops.ceoReportCompleted;
  }

  return ui.ops.ceoReportDefault;
}

/** Generate company operations summary after learning stage. */
export function generateCompanyOperationsReport(
  result: OrchestrationResult,
): CompanyOperationsReport | null {
  if (result.status !== "completed") {
    return null;
  }

  const prReview = generatePrReview(result);
  const growthReview =
    prReview && prReview.shouldShare
      ? generateGrowthReview(prReview, result)
      : null;
  const learning = generateCompanyLearning(result);

  return {
    todayStatus: buildTodayStatus(result, prReview, learning),
    departmentHighlights: buildDepartmentHighlights(
      result,
      prReview,
      growthReview,
      learning,
    ),
    health: buildHealthIndicators(result, growthReview, learning),
    ceoDailyReport: buildCeoDailyReport(result, learning),
    extensions: OPERATIONS_EXTENSION_STUBS,
  };
}
