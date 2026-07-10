/**
 * Core agent type definitions for the Atlas multi-agent platform.
 * Safe to import from client or server (no OpenAI dependencies).
 */

/** Unique agent identifiers used across the platform. */
export type AgentId = "ceo" | "planner" | "worker" | "reviewer";

/** Agent role — mirrors AgentId for type-safe role-based lookups. */
export type AgentRole = AgentId;

/**
 * Organizational tier for future orchestration routing.
 * Determines where an agent sits in the execution hierarchy.
 */
export type AgentTier = "leadership" | "planning" | "execution" | "quality";

/** Capabilities an agent may possess — used for routing and tool assignment later. */
export type AgentCapability =
  | "goal_interpretation"
  | "priority_setting"
  | "delegation"
  | "task_decomposition"
  | "scheduling"
  | "resource_estimation"
  | "task_execution"
  | "content_generation"
  | "research"
  | "quality_review"
  | "approval"
  | "feedback";

/** Static definition of an agent — prompts, metadata, and capabilities. */
export type AgentDefinition = {
  id: AgentId;
  role: AgentRole;
  name: string;
  description: string;
  tier: AgentTier;
  capabilities: readonly AgentCapability[];
  /** System instructions sent to the Responses API as `instructions`. */
  instructions: string;
};

/** Output from a prior agent in a multi-step workflow. */
export type AgentPriorOutput = {
  agentId: AgentId;
  role: AgentRole;
  output: string;
  responseId?: string;
};

/**
 * Shared context passed between agents during orchestration.
 * Orchestration layer will populate this; agents consume it as read-only input.
 */
export type AgentContext = {
  /** The user's original work assignment or goal. */
  assignment: string;
  /** Outputs produced by agents that ran earlier in the pipeline. */
  priorOutputs?: readonly AgentPriorOutput[];
  /** Optional key-value metadata (project ID, user ID, etc.). */
  metadata?: Readonly<Record<string, unknown>>;
};

/** Input for a single agent run. */
export type AgentRunInput = {
  /** The specific task or message for this agent. */
  task: string;
  /** Shared workflow context from the assignment pipeline. */
  context?: AgentContext;
  /** Continue a prior Responses API conversation thread. */
  previousResponseId?: string;
  /** Model routing task type for cost optimization. */
  aiTaskType?: import("@/lib/ai/model-policy").AiTaskType;
};

/** Result returned after an agent completes a run. */
export type AgentRunResult = {
  agentId: AgentId;
  role: AgentRole;
  name: string;
  outputText: string;
  responseId: string;
  status: string;
  model: string;
};

/** Registry map type for looking up agents by ID. */
export type AgentRegistry = Readonly<Record<AgentId, AgentDefinition>>;
