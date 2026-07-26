import {
  AUTONOMY_LABELS,
  resolveAutonomyLevel,
  SECRETARY_INTELLIGENCE_VERSION,
} from "@/lib/secretary-intelligence/config"
import { buildExecutionPlan } from "@/lib/secretary-intelligence/execution"
import { analyzeIntent } from "@/lib/secretary-intelligence/intent"
import {
  checkMissingInformation,
  unresolvedMissing,
} from "@/lib/secretary-intelligence/missing-info"
import { generateQuestions } from "@/lib/secretary-intelligence/questions"
import { decideResearch } from "@/lib/secretary-intelligence/research"
import { checkRisk } from "@/lib/secretary-intelligence/risk"
import { planSecretaryTasks } from "@/lib/secretary-intelligence/tasks"
import type {
  SecretaryAnalyzeInput,
  SecretaryIntelligencePlan,
} from "@/lib/secretary-intelligence/types"

function readKnownFacts(
  metadata: Readonly<Record<string, unknown>> | null | undefined,
  explicit?: readonly string[],
): string[] {
  const out: string[] = [...(explicit ?? [])]
  if (!metadata) return out
  for (const key of [
    "businessProfileSummary",
    "businessProfile",
    "companyProfile",
    "atlasMemory",
    "userSettingsSummary",
    "pastDeliverableHints",
  ]) {
    const v = metadata[key]
    if (typeof v === "string" && v.trim()) out.push(v)
    else if (v && typeof v === "object") {
      try {
        out.push(JSON.stringify(v).slice(0, 1_500))
      } catch {
        // ignore
      }
    }
  }
  return out
}

function userFacingFor(plan: {
  pauseForQuestions: boolean
  researchNeeded: boolean
  missingOpen: number
}): SecretaryIntelligencePlan["userFacing"] {
  if (plan.pauseForQuestions) {
    return {
      headline: "確認したい点があります",
      detail: "必要情報を整理しています。いくつかだけ教えてください。",
    }
  }
  if (plan.researchNeeded) {
    return {
      headline: "内容を確認しています",
      detail: "必要な情報を調べ、進め方を整えています。",
    }
  }
  if (plan.missingOpen > 0) {
    return {
      headline: "必要情報を整理しています",
      detail: "わかる範囲で進め、品質を保つ準備をしています。",
    }
  }
  return {
    headline: "内容を確認しています",
    detail: "依頼の目的と進め方を整理しています。",
  }
}

/**
 * Secretary Intelligence Core — deterministic, no LLM.
 * Runs before Quality Engine / Writer path.
 */
export function analyzeSecretaryWork(
  input: SecretaryAnalyzeInput,
): SecretaryIntelligencePlan {
  const meta = input.metadata ?? {}
  const autonomyLevel = resolveAutonomyLevel(
    input.autonomyLevel ?? meta.secretaryAutonomyLevel ?? meta.autonomyLevel,
    typeof meta.executionLevel === "string" ? meta.executionLevel : null,
  )

  const intent = analyzeIntent(input.assignment)
  const knownFacts = readKnownFacts(meta, input.knownFacts)
  const hasBusinessProfile =
    input.hasBusinessProfile ??
    Boolean(
      meta.businessProfileSummary ||
        meta.businessProfile ||
        meta.companyProfile,
    )
  const hasReference =
    input.hasReference ??
    ((Array.isArray(meta.attachments) && meta.attachments.length > 0) ||
      Boolean(meta.referenceSpecified))
  const hasTemplate =
    input.hasTemplate ??
    Boolean(meta.companyTemplateId || meta.templateId || meta.templateHints)
  const hasKnowledge = input.hasKnowledge ?? true

  const missingInfo = checkMissingInformation({
    assignment: input.assignment,
    promptKind: intent.promptKind,
    knownFacts,
    hasBusinessProfile,
  })
  const openMissing = unresolvedMissing(missingInfo)
  const questions = generateQuestions({
    missing: missingInfo,
    autonomyLevel,
  })
  const research = decideResearch({
    assignment: input.assignment,
    intent,
  })
  const executionPlan = buildExecutionPlan({
    intent,
    research,
    hasBusinessProfile,
    hasReference,
    hasTemplate,
    hasKnowledge,
  })
  const risk = checkRisk({
    assignment: input.assignment,
    autonomyLevel,
  })

  // Only Autonomy Level 1 hard-pauses the pipeline (Writer/Planner not started).
  // Level 2+ keeps questions for Owner / soft confirm, but continues generation
  // to avoid blocking deliverable work (cost-efficient secretary default).
  const pauseForQuestions = autonomyLevel === 1 && questions.length > 0

  const confirmationReasons: string[] = []
  if (pauseForQuestions) {
    confirmationReasons.push("不足情報があるため確認が必要")
  }
  if (risk.requiresConfirmation) {
    confirmationReasons.push(...risk.reasons)
  }
  if (autonomyLevel === 1) {
    confirmationReasons.push(`自律レベル1（${AUTONOMY_LABELS[1]}）`)
  }

  const tasks = planSecretaryTasks({
    intent,
    research,
    needQuestions: questions.length > 0,
    useReference: executionPlan.useReference,
    useKnowledge: executionPlan.useKnowledge,
  })

  const userFacing = userFacingFor({
    pauseForQuestions,
    researchNeeded: research.needed,
    missingOpen: openMissing.length,
  })

  return {
    intent,
    tasks,
    missingInfo,
    questions,
    research,
    executionPlan,
    risk,
    autonomyLevel,
    pauseForQuestions,
    confirmationReasons: Array.from(new Set(confirmationReasons)),
    extraLlmCalls: 0,
    analyzedAt: new Date().toISOString(),
    userFacing,
    ownerSummary: {
      intentLabel: intent.trueGoal,
      missingCount: openMissing.length,
      questionCount: questions.length,
      research: research.needed,
      riskDisposition: risk.disposition,
      autonomyLevel,
      pauseForQuestions,
    },
  }
}

export { SECRETARY_INTELLIGENCE_VERSION }
