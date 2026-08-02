import type {
  MetricsComparison,
  WorkflowLearningCandidate,
  WorkflowLearningSettings,
} from "@/lib/workflow-learning/types";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string | { message?: string } };
  if (!response.ok) {
    const message =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message ?? "request_failed";
    throw new Error(message);
  }
  return payload;
}

export async function fetchWorkflowLearningCandidates(input?: {
  automationId?: string;
  status?: string;
}): Promise<{ candidates: WorkflowLearningCandidate[] }> {
  const params = new URLSearchParams();
  if (input?.automationId) params.set("automationId", input.automationId);
  if (input?.status) params.set("status", input.status);
  const qs = params.toString();
  const response = await fetch(
    `/api/workflow-learning/candidates${qs ? `?${qs}` : ""}`,
    { cache: "no-store" },
  );
  return parseJson(response);
}

export async function analyzeWorkflowLearning(
  automationId: string,
): Promise<{ candidates: WorkflowLearningCandidate[] }> {
  const response = await fetch("/api/workflow-learning/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ automationId }),
  });
  return parseJson(response);
}

export async function approveWorkflowCandidate(candidateId: string) {
  const response = await fetch(
    `/api/workflow-learning/candidates/${encodeURIComponent(candidateId)}/approve`,
    { method: "POST" },
  );
  return parseJson<{ candidate: WorkflowLearningCandidate }>(response);
}

export async function rejectWorkflowCandidate(
  candidateId: string,
  suppressFuture = false,
) {
  const response = await fetch(
    `/api/workflow-learning/candidates/${encodeURIComponent(candidateId)}/reject`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suppressFuture }),
    },
  );
  return parseJson<{ candidate: WorkflowLearningCandidate }>(response);
}

export async function applyWorkflowCandidate(input: {
  candidateId: string;
  trial?: boolean;
  allowHighRiskExternal?: boolean;
  editedPatch?: WorkflowLearningCandidate["proposedPatch"];
}) {
  const response = await fetch(
    `/api/workflow-learning/candidates/${encodeURIComponent(input.candidateId)}/apply`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trial: input.trial,
        allowHighRiskExternal: input.allowHighRiskExternal,
        editedPatch: input.editedPatch,
      }),
    },
  );
  return parseJson<{
    candidate: WorkflowLearningCandidate;
    revisionId: string;
    trialId?: string;
  }>(response);
}

export async function rollbackWorkflowRevision(input: {
  automationId: string;
  targetRevisionId: string;
}) {
  const response = await fetch("/api/workflow-learning/rollback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<{ revisionId: string }>(response);
}

export async function fetchWorkflowLearningSettings() {
  const response = await fetch("/api/workflow-learning/settings", {
    cache: "no-store",
  });
  return parseJson<{ settings: WorkflowLearningSettings }>(response);
}

export async function compareWorkflowLearning(input: {
  automationId: string;
  beforeRevisionId: string;
  afterRevisionId: string;
}) {
  const response = await fetch("/api/workflow-learning/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<{ comparison: MetricsComparison }>(response);
}

export async function recordWorkflowCorrectionClient(input: {
  automationId: string;
  text: string;
  runId?: string | null;
}) {
  const response = await fetch("/api/workflow-learning/corrections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<{ signalCreated: boolean }>(response);
}
