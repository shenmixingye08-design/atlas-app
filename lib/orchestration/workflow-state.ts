import type { OrchestrationStep } from "./types";

/** Typed workflow lifecycle states — canonical replacement for coarse string statuses. */
export const WorkflowState = {
  Pending: "pending",
  Planning: "planning",
  Researching: "researching",
  Generating: "generating",
  Reviewing: "reviewing",
  QA: "qa",
  Approved: "approved",
  DeliverableReady: "deliverable_ready",
  Completed: "completed",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;

export type WorkflowState = (typeof WorkflowState)[keyof typeof WorkflowState];

/** @deprecated Legacy binary status — derive from {@link WorkflowState} via {@link legacyOrchestrationStatus}. */
export type LegacyOrchestrationStatus = "completed" | "failed";

export type WorkflowStateTransition = {
  from: WorkflowState;
  to: WorkflowState;
  at: string;
  reason?: string;
};

/** Persisted workflow state attached to {@link import("./types").OrchestrationResult}. */
export type WorkflowStateRecord = {
  workflowId: string;
  state: WorkflowState;
  transitions: WorkflowStateTransition[];
  updatedAt: string;
  timedOut?: boolean;
  failureReason?: string;
};

export class IllegalWorkflowTransitionError extends Error {
  readonly from: WorkflowState;
  readonly to: WorkflowState;

  constructor(from: WorkflowState, to: WorkflowState) {
    super(`Illegal workflow transition: ${from} → ${to}`);
    this.name = "IllegalWorkflowTransitionError";
    this.from = from;
    this.to = to;
  }
}

const TERMINAL_STATES: ReadonlySet<WorkflowState> = new Set([
  WorkflowState.Completed,
  WorkflowState.Failed,
  WorkflowState.Cancelled,
]);

/** Legal transitions — single source of truth for the state machine. */
export const WORKFLOW_TRANSITIONS: Readonly<Record<WorkflowState, readonly WorkflowState[]>> = {
  [WorkflowState.Pending]: [
    WorkflowState.Researching,
    WorkflowState.Planning,
    WorkflowState.Failed,
    WorkflowState.Cancelled,
  ],
  [WorkflowState.Researching]: [
    WorkflowState.Planning,
    WorkflowState.Failed,
    WorkflowState.Cancelled,
  ],
  [WorkflowState.Planning]: [
    WorkflowState.Generating,
    WorkflowState.Failed,
    WorkflowState.Cancelled,
  ],
  [WorkflowState.Generating]: [
    WorkflowState.Reviewing,
    WorkflowState.QA,
    WorkflowState.Failed,
    WorkflowState.Cancelled,
  ],
  [WorkflowState.Reviewing]: [
    WorkflowState.QA,
    WorkflowState.Failed,
    WorkflowState.Cancelled,
  ],
  [WorkflowState.QA]: [
    WorkflowState.Generating,
    WorkflowState.Approved,
    WorkflowState.Failed,
    WorkflowState.Cancelled,
  ],
  [WorkflowState.Approved]: [
    WorkflowState.DeliverableReady,
    WorkflowState.Failed,
    WorkflowState.Cancelled,
  ],
  [WorkflowState.DeliverableReady]: [
    WorkflowState.Completed,
    WorkflowState.Failed,
    WorkflowState.Cancelled,
  ],
  [WorkflowState.Completed]: [],
  [WorkflowState.Failed]: [],
  [WorkflowState.Cancelled]: [],
};

const DELIVERABLE_ALLOWED_STATES: ReadonlySet<WorkflowState> = new Set([
  WorkflowState.Approved,
  WorkflowState.DeliverableReady,
  WorkflowState.Completed,
]);

export function isTerminalWorkflowState(state: WorkflowState): boolean {
  return TERMINAL_STATES.has(state);
}

export function canTransitionWorkflow(from: WorkflowState, to: WorkflowState): boolean {
  if (from === to) return true;
  return WORKFLOW_TRANSITIONS[from].includes(to);
}

export function assertDeliverableStateAllowed(state: WorkflowState): void {
  if (!DELIVERABLE_ALLOWED_STATES.has(state)) {
    throw new IllegalWorkflowTransitionError(
      state,
      WorkflowState.DeliverableReady,
    );
  }
}

export function legacyOrchestrationStatus(state: WorkflowState): LegacyOrchestrationStatus {
  return state === WorkflowState.Failed || state === WorkflowState.Cancelled
    ? "failed"
    : "completed";
}

export function logWorkflowTransition(transition: WorkflowStateTransition): void {
  if (process.env.NODE_ENV === "production") return;

  const reason = transition.reason ? ` (${transition.reason})` : "";
  console.info(
    `[ATLAS Workflow] ${transition.from} → ${transition.to}${reason}`,
  );
}

export function workflowStateForStep(step: OrchestrationStep): WorkflowState | null {
  switch (step) {
    case "ceo":
      return WorkflowState.Pending;
    case "research_assessment":
    case "research_report":
      return WorkflowState.Researching;
    case "planner_plan":
    case "planner_tasks":
      return WorkflowState.Planning;
    case "worker":
      return WorkflowState.Generating;
    case "reviewer":
      return WorkflowState.Reviewing;
    case "quality_assurance":
    case "final_deliverable":
      return WorkflowState.QA;
    case "ceo_approval":
      return WorkflowState.Approved;
    default:
      return null;
  }
}

/** Central workflow state manager — one valid state at all times. */
export class WorkflowStateManager {
  private state: WorkflowState;
  private readonly transitions: WorkflowStateTransition[] = [];
  private readonly workflowId: string;
  private timedOut = false;
  private failureReason: string | undefined;

  constructor(workflowId: string, initial: WorkflowState = WorkflowState.Pending) {
    this.workflowId = workflowId;
    this.state = initial;
  }

  static resume(record: WorkflowStateRecord): WorkflowStateManager {
    const manager = new WorkflowStateManager(record.workflowId, record.state);
    manager.transitions.push(...record.transitions);
    manager.timedOut = record.timedOut ?? false;
    manager.failureReason = record.failureReason;
    return manager;
  }

  getState(): WorkflowState {
    return this.state;
  }

  getSnapshot(): WorkflowStateRecord {
    return {
      workflowId: this.workflowId,
      state: this.state,
      transitions: [...this.transitions],
      updatedAt: new Date().toISOString(),
      ...(this.timedOut ? { timedOut: true } : {}),
      ...(this.failureReason ? { failureReason: this.failureReason } : {}),
    };
  }

  transition(to: WorkflowState, reason?: string): void {
    if (this.state === to) return;

    if (!canTransitionWorkflow(this.state, to)) {
      throw new IllegalWorkflowTransitionError(this.state, to);
    }

    if (to === WorkflowState.DeliverableReady) {
      assertDeliverableStateAllowed(this.state);
    }

    if (to === WorkflowState.Completed && this.state !== WorkflowState.DeliverableReady) {
      throw new IllegalWorkflowTransitionError(this.state, WorkflowState.Completed);
    }

    const entry: WorkflowStateTransition = {
      from: this.state,
      to,
      at: new Date().toISOString(),
      ...(reason ? { reason } : {}),
    };

    this.transitions.push(entry);
    this.state = to;
    logWorkflowTransition(entry);
  }

  transitionForStep(step: OrchestrationStep, reason?: string): void {
    const target = workflowStateForStep(step);
    if (target) {
      this.transition(target, reason ?? step);
    }
  }

  fail(reason: string, options: { timedOut?: boolean } = {}): void {
    this.failureReason = reason;
    this.timedOut = options.timedOut ?? false;
    if (!isTerminalWorkflowState(this.state)) {
      this.transition(WorkflowState.Failed, reason);
    }
  }

  cancel(reason = "cancelled"): void {
    if (!isTerminalWorkflowState(this.state)) {
      this.transition(WorkflowState.Cancelled, reason);
    }
  }

  /** Finalize success path — enforces DeliverableReady before Completed. */
  finalize(params: { hasDeliverable: boolean; approved: boolean }): void {
    if (!params.hasDeliverable) {
      this.fail("Deliverable missing at workflow completion");
      return;
    }

    if (
      this.state === WorkflowState.QA ||
      this.state === WorkflowState.Approved ||
      this.state === WorkflowState.Reviewing ||
      this.state === WorkflowState.Generating
    ) {
      if (this.state !== WorkflowState.Approved) {
        this.transition(WorkflowState.Approved, "pipeline approved for deliverable");
      }
      this.transition(WorkflowState.DeliverableReady, "deliverable validated");
    } else if (this.state === WorkflowState.DeliverableReady) {
      // Already at deliverable ready — proceed to completion when approved.
    } else if (!isTerminalWorkflowState(this.state)) {
      this.fail(`Cannot finalize from state ${this.state}`);
      return;
    }

    if (params.approved) {
      this.transition(WorkflowState.Completed, "workflow completed");
    }
  }
}

/** Infer last valid workflow state from a partial/finished orchestration snapshot (recovery). */
export function inferWorkflowStateFromResult(partial: {
  status?: LegacyOrchestrationStatus;
  approved?: boolean;
  ceo?: unknown;
  research?: { reportStatus?: string; assessment?: { required?: boolean } };
  plannerPlan?: unknown;
  executions?: unknown[];
  qualityLoop?: { ceoApproval?: unknown; passed?: boolean };
  deliverable?: unknown;
  stepError?: { timedOut?: boolean; step?: OrchestrationStep };
  workflow?: WorkflowStateRecord;
}): WorkflowState {
  if (partial.workflow?.state) {
    return partial.workflow.state;
  }

  if (partial.status === "failed" || partial.stepError) {
    return WorkflowState.Failed;
  }

  const hasDeliverable = Boolean(
    partial.deliverable &&
      typeof partial.deliverable === "object" &&
      "markdown" in (partial.deliverable as Record<string, unknown>),
  );

  if (partial.approved && hasDeliverable) return WorkflowState.Completed;
  if (hasDeliverable) return WorkflowState.DeliverableReady;
  if (partial.qualityLoop?.ceoApproval) return WorkflowState.Approved;
  if (partial.qualityLoop) return WorkflowState.QA;
  if (partial.executions?.length) return WorkflowState.Reviewing;
  if (partial.plannerPlan) return WorkflowState.Planning;
  if (partial.research?.reportStatus === "completed") return WorkflowState.Planning;
  if (partial.research?.assessment?.required) return WorkflowState.Researching;
  if (partial.ceo) return WorkflowState.Pending;

  return WorkflowState.Pending;
}

/** Build a persisted workflow record when legacy results lack one. */
export function hydrateWorkflowState(
  result: Parameters<typeof inferWorkflowStateFromResult>[0] & {
    workflow?: WorkflowStateRecord;
  },
  workflowId = crypto.randomUUID(),
): WorkflowStateRecord {
  if (result.workflow) return result.workflow;

  const state = inferWorkflowStateFromResult(result);
  return {
    workflowId,
    state,
    transitions: [],
    updatedAt: new Date().toISOString(),
    ...(result.stepError?.timedOut ? { timedOut: true } : {}),
  };
}

/** Mermaid transition diagram (documentation / dev tooling). */
export function workflowTransitionDiagramMermaid(): string {
  return `stateDiagram-v2
    [*] --> Pending
    Pending --> Researching
    Pending --> Planning
    Researching --> Planning
    Planning --> Generating
    Generating --> Reviewing
    Reviewing --> QA
    QA --> Generating : revision
    QA --> Approved
    Approved --> DeliverableReady
    DeliverableReady --> Completed
    Pending --> Failed
    Researching --> Failed
    Planning --> Failed
    Generating --> Failed
    Reviewing --> Failed
    QA --> Failed
    Approved --> Failed
    DeliverableReady --> Failed
    Pending --> Cancelled
    Researching --> Cancelled
    Planning --> Cancelled
    Generating --> Cancelled
    Reviewing --> Cancelled
    QA --> Cancelled
    Approved --> Cancelled
    DeliverableReady --> Cancelled
    Completed --> [*]
    Failed --> [*]
    Cancelled --> [*]`;
}
