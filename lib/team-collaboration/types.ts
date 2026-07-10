import type { StepStatus } from "@/lib/workspace/types";

export type TeamHandoff = {
  fromEmployeeId: string;
  fromEmployeeName: string;
  toEmployeeId: string;
  toEmployeeName: string;
  taskTitle: string;
  reason: string;
};

export type TeamCollaborationStage = {
  id: string;
  icon: string;
  title: string;
  description: string;
  employeeId?: string;
  employeeName?: string;
  departmentLabel?: string;
  status: StepStatus;
  durationMs?: number;
  errorMessage?: string;
  dependsOn?: string[];
  reassigned?: boolean;
};

export type TeamCollaborationSnapshot = {
  stages: TeamCollaborationStage[];
  handoffs: TeamHandoff[];
  activeEmployeeIds: string[];
  mergedDeliverableReady: boolean;
  finalReviewPassed: boolean;
};

export type EmployeeTeamStat = {
  employeeId: string;
  employeeName: string;
  departmentLabel: string;
  assignedCount: number;
  completedCount: number;
  failedCount: number;
  avgDurationMs: number;
  successRate: number;
  failureRate: number;
};

export type EmployeeTeamStatsSnapshot = {
  employees: EmployeeTeamStat[];
  totalRuns: number;
  generatedAt: string;
};
