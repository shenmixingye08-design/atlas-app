import type {
  ExecutionPlanDecision,
  ResearchDecision,
  SecretaryIntent,
} from "@/lib/secretary-intelligence/types"

/** Decide what resources to use this run — no LLM. */
export function buildExecutionPlan(input: {
  intent: SecretaryIntent
  research: ResearchDecision
  hasBusinessProfile: boolean
  hasReference: boolean
  hasTemplate: boolean
  hasKnowledge: boolean
}): ExecutionPlanDecision {
  const kind = input.intent.promptKind
  const shortForm = kind === "sns" || kind === "email"
  const notes: string[] = []

  const useBusinessProfile = true
  const useKnowledge = !shortForm || input.hasKnowledge
  const useReference = input.hasReference || /参考|添付|資料に沿/.test(
    input.intent.trueGoal + kind,
  )
  const useTemplate =
    input.hasTemplate ||
    kind === "contract" ||
    kind === "sales_material" ||
    kind === "proposal"
  const useWebResearch = input.research.needed
  const useQualityEngine = true
  const usePastArtifacts = !shortForm

  if (useBusinessProfile) notes.push("Business Profile を使用")
  if (useKnowledge) notes.push("Knowledge を使用")
  if (useReference) notes.push("Reference を使用")
  if (useTemplate) notes.push("Template を使用")
  if (useWebResearch) notes.push("Web Research を実施")
  else notes.push("Web Research をスキップ")
  if (useQualityEngine) notes.push("Quality Engine で仕上げ")

  return {
    useBusinessProfile,
    useKnowledge,
    useReference: useReference || input.hasReference,
    useTemplate,
    useWebResearch,
    useQualityEngine,
    usePastArtifacts,
    notes,
  }
}
