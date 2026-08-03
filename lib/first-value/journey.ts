export type FirstValueJourneyStepId =
  | "job_created"
  | "ai_executed"
  | "deliverable_ready"
  | "saved"
  | "notified"
  | "downloadable";

export type FirstValueJourneyStep = {
  id: FirstValueJourneyStepId;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  detail?: string | null;
};

export type FirstValueJourney = {
  jobId: string;
  title: string;
  candidateLabel: string;
  frequency: string;
  steps: FirstValueJourneyStep[];
  downloadUrl: string | null;
  deliverableId: string | null;
  notificationId: string | null;
  estimatedMinutesSaved: number;
  completedAt: string | null;
};

export function buildInitialJourneySteps(): FirstValueJourneyStep[] {
  return [
    { id: "job_created", label: "仕事作成", status: "pending" },
    { id: "ai_executed", label: "AI実行", status: "pending" },
    { id: "deliverable_ready", label: "成果物完成", status: "pending" },
    { id: "saved", label: "保存", status: "pending" },
    { id: "notified", label: "通知", status: "pending" },
    { id: "downloadable", label: "ダウンロード", status: "pending" },
  ];
}

export function markJourneyStep(
  steps: FirstValueJourneyStep[],
  id: FirstValueJourneyStepId,
  status: FirstValueJourneyStep["status"],
  detail?: string | null,
): FirstValueJourneyStep[] {
  return steps.map((step) =>
    step.id === id ? { ...step, status, detail: detail ?? step.detail } : step,
  );
}

export function isJourneyComplete(steps: FirstValueJourneyStep[]): boolean {
  return steps.every((s) => s.status === "completed");
}
