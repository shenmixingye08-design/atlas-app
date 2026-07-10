import type { AgentId } from "@/lib/agents/types";

/** Canonical employee identifier — `{department-key}-{role-slug}` format. */
export type EmployeeId = string;

/** Unique department identifiers across the Atlas organization. */
export type DepartmentId =
  | "ceo-office"
  | "sales"
  | "planning"
  | "research"
  | "development"
  | "design"
  | "marketing"
  | "legal"
  | "finance"
  | "hr"
  | "customer-success"
  | "quality-assurance";

/** Static definition of an organizational department. */
export type Department = {
  id: DepartmentId;
  name: string;
  description: string;
  color: string;
  /** Emoji or short glyph representing the department. */
  icon: string;
  /** Default responsibilities owned by this department. */
  defaultResponsibilities: readonly string[];
  /**
   * Department-level system prompt.
   * Source of truth: `lib/prompts/system/{department}.ts`.
   */
  systemPrompt: string;
};

/** An AI employee in the Atlas organization. */
export type Employee = {
  id: EmployeeId;
  name: string;
  department: DepartmentId;
  role: string;
  avatar: string;
  color: string;
  specialties: readonly string[];
  /** Links to the workflow agent layer when this employee drives orchestration. */
  workflowAgentId?: AgentId;
  /**
   * System prompt (`instructions` in the Responses API).
   * Source of truth: `lib/prompts/system/{department}.ts` — do not inline prompt text here.
   */
  systemPrompt: string;
};

/** Registry map type — supports unlimited employees via string keys. */
export type EmployeeRegistry = Readonly<Record<EmployeeId, Employee>>;

/** Department registry map type. */
export type DepartmentRegistry = Readonly<Record<DepartmentId, Department>>;
