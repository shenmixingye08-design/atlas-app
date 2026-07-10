import type { Department, DepartmentId } from "@/lib/employees/types";

/**
 * Extended department definition for the ATLAS Department System.
 * Builds on {@link Department} with prompts, icons, and routing metadata.
 */
export type DepartmentDefinition = Department & {
  /** Emoji or short glyph for UI badges (not wired to UI yet). */
  icon: string;
  /** High-level responsibilities this department owns by default. */
  defaultResponsibilities: readonly string[];
  /**
   * Department-level system prompt shared by employees unless overridden.
   * Source of truth: `lib/prompts/system/{department}.ts`.
   */
  systemPrompt: string;
  /** Lowercase keywords used to route Planner tasks to this department. */
  taskKeywords: readonly string[];
  /** When true, employees from this department may be assigned as parallel workers. */
  workerEligible: boolean;
};

/** The nine departments that supply parallel worker employees. */
export type WorkerEligibleDepartmentId =
  | "development"
  | "marketing"
  | "sales"
  | "design"
  | "research"
  | "legal"
  | "finance"
  | "hr"
  | "customer-success";

/** Orchestration-only departments (CEO, Planner, QA) — not worker pool members. */
export type OrchestrationDepartmentId =
  | "ceo-office"
  | "planning"
  | "quality-assurance";

export type WorkerDepartmentId = WorkerEligibleDepartmentId;

export function isWorkerEligibleDepartment(
  id: DepartmentId,
): id is WorkerEligibleDepartmentId {
  return WORKER_ELIGIBLE_DEPARTMENT_IDS.includes(id as WorkerEligibleDepartmentId);
}

/** Ordered list of departments eligible for parallel worker assignment. */
export const WORKER_ELIGIBLE_DEPARTMENT_IDS = [
  "development",
  "marketing",
  "sales",
  "design",
  "research",
  "legal",
  "finance",
  "hr",
  "customer-success",
] as const satisfies readonly WorkerEligibleDepartmentId[];

export type DepartmentRegistry = Readonly<Record<DepartmentId, DepartmentDefinition>>;
