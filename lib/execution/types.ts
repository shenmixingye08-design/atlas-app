import type { ActionRequest } from "@/lib/actions/types";

export type SimulationPhase =
  | "queued"
  | "preparing"
  | "executing"
  | "completed";

export type ExecutionTimelineStep = {
  phase: SimulationPhase;
  label: string;
  durationMs: number;
  completed: boolean;
};

/** Simulated execution record for sandbox mode. */
export type SimulatedExecution = {
  actionId: string;
  action: string;
  providerName: string;
  targetService: string;
  phase: SimulationPhase;
  statusLabel: string;
  totalDurationMs: number;
  summary: string;
  detail: string | null;
  timeline: readonly ExecutionTimelineStep[];
};

export type ExecutionSummary = {
  summary: string;
  detail: string | null;
};

type ExtensionStub = { enabled: false; note: string };

export type ExecutionSimulatorExtensions = {
  realProviders: ExtensionStub;
  oauthExecution: ExtensionStub;
  liveWebhooks: ExtensionStub;
};

export const EXECUTION_EXTENSION_STUBS: ExecutionSimulatorExtensions = {
  realProviders: { enabled: false, note: "実プロバイダー実行（将来対応）" },
  oauthExecution: { enabled: false, note: "OAuth実行（将来対応）" },
  liveWebhooks: { enabled: false, note: "Webhook（将来対応）" },
};

export const PHASE_DURATIONS_MS: Record<SimulationPhase, number> = {
  queued: 400,
  preparing: 600,
  executing: 900,
  completed: 0,
};

export type SandboxExecutionPlan = {
  executions: SimulatedExecution[];
  extensions: ExecutionSimulatorExtensions;
};
