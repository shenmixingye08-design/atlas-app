export type FirstValueJourneyStepId =
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
  automationId: string | null;
  estimatedMinutesSaved: number;
  /** Written when deliverable path succeeds — feeds measured ROI. */
  measuredMinutesSaved: number | null;
  completedAt: string | null;
};

/**
 * 仕事完了一覧 steps — example:
 * 営業資料 → 保存 → 通知 → ダウンロード
 */
export function buildInitialJourneySteps(
  candidateLabel: string,
): FirstValueJourneyStep[] {
  return [
    {
      id: "deliverable_ready",
      label: candidateLabel,
      status: "pending",
    },
    {
      id: "saved",
      label: "保存",
      status: "pending",
      detail: "Google Drive連携時はDriveへ。未接続時はアプリ内へ保存します",
    },
    {
      id: "notified",
      label: "通知",
      status: "pending",
    },
    {
      id: "downloadable",
      label: "ダウンロード",
      status: "pending",
    },
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

/** Journey is "work complete" when deliverable+save+notify done; download may wait for user. */
export function isJourneyWorkComplete(steps: FirstValueJourneyStep[]): boolean {
  return steps
    .filter((s) => s.id !== "downloadable")
    .every((s) => s.status === "completed");
}

export function isJourneyComplete(steps: FirstValueJourneyStep[]): boolean {
  return steps.every((s) => s.status === "completed");
}
