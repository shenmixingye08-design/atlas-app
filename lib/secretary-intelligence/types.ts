import type { DeliverableType } from "@/lib/orchestration/deliverable-types"
import type { QualityPromptKind } from "@/lib/quality-engine/types"

/** User-configurable secretary autonomy. */
export type SecretaryAutonomyLevel = 1 | 2 | 3 | 4

export type RiskActionKind =
  | "send"
  | "publish"
  | "delete"
  | "contract"
  | "payment"
  | "none"

export type RiskDisposition = "auto" | "confirm" | "forbid"

export type SecretaryIntent = {
  purpose: string
  artifactHint: string
  deliverableType: DeliverableType
  promptKind: QualityPromptKind
  audience: string | null
  deadline: string | null
  priority: "low" | "normal" | "high" | "urgent"
  requiredActions: readonly string[]
  trueGoal: string
}

export type SecretaryTaskStep = {
  id: string
  label: string
  /** Internal only — never shown to end users as AI role names. */
  kind:
    | "fetch_profile"
    | "fetch_reference"
    | "fetch_knowledge"
    | "structure"
    | "write"
    | "review"
    | "research"
    | "ask_user"
    | "finalize"
  optional: boolean
}

export type MissingInfoItem = {
  id: string
  label: string
  critical: boolean
  /** Already answered in memory / profile / assignment. */
  resolvedFromMemory: boolean
}

export type SecretaryQuestion = {
  id: string
  prompt: string
  relatedMissingId: string
}

export type ResearchDecision = {
  needed: boolean
  reason: string
  categories: readonly string[]
}

export type ExecutionPlanDecision = {
  useBusinessProfile: boolean
  useKnowledge: boolean
  useReference: boolean
  useTemplate: boolean
  useWebResearch: boolean
  useQualityEngine: boolean
  usePastArtifacts: boolean
  notes: readonly string[]
}

export type RiskCheckResult = {
  actions: readonly RiskActionKind[]
  disposition: RiskDisposition
  reasons: readonly string[]
  requiresConfirmation: boolean
}

export type SecretaryUserFacingStatus = {
  /** Natural language for end users — never exposes internal structure. */
  headline: string
  detail: string
}

export type SecretaryIntelligencePlan = {
  intent: SecretaryIntent
  tasks: readonly SecretaryTaskStep[]
  missingInfo: readonly MissingInfoItem[]
  questions: readonly SecretaryQuestion[]
  research: ResearchDecision
  executionPlan: ExecutionPlanDecision
  risk: RiskCheckResult
  autonomyLevel: SecretaryAutonomyLevel
  /** When true, pipeline should pause and return questions (no Writer LLM). */
  pauseForQuestions: boolean
  confirmationReasons: readonly string[]
  /** Extra LLM calls introduced by this layer (always 0 for rule path). */
  extraLlmCalls: number
  analyzedAt: string
  userFacing: SecretaryUserFacingStatus
  /** Owner-only summary lines. */
  ownerSummary: {
    intentLabel: string
    missingCount: number
    questionCount: number
    research: boolean
    riskDisposition: RiskDisposition
    autonomyLevel: SecretaryAutonomyLevel
    pauseForQuestions: boolean
  }
}

export type SecretaryAnalyzeInput = {
  assignment: string
  metadata?: Readonly<Record<string, unknown>> | null
  /** Known facts from Business Profile / memory (to avoid repeat questions). */
  knownFacts?: readonly string[]
  hasBusinessProfile?: boolean
  hasReference?: boolean
  hasTemplate?: boolean
  hasKnowledge?: boolean
  autonomyLevel?: SecretaryAutonomyLevel | null
}
