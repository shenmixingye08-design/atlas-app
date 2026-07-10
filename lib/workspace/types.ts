export type StepStatus = "waiting" | "running" | "completed" | "error";

export type WorkflowPhaseState = {
  id: string;
  label: string;
  subtitle: string;
  status: StepStatus;
  output?: string;
  durationMs?: number;
  errorMessage?: string;
};
