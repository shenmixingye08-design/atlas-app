import type {
  SecretaryIntent,
  SecretaryTaskStep,
  ResearchDecision,
} from "@/lib/secretary-intelligence/types"

/** Decompose work into executable steps — no LLM. */
export function planSecretaryTasks(input: {
  intent: SecretaryIntent
  research: ResearchDecision
  needQuestions: boolean
  useReference: boolean
  useKnowledge: boolean
}): SecretaryTaskStep[] {
  const steps: SecretaryTaskStep[] = [
    {
      id: "profile",
      label: "会社情報を整理",
      kind: "fetch_profile",
      optional: false,
    },
  ]

  if (input.useReference) {
    steps.push({
      id: "reference",
      label: "参考資料を確認",
      kind: "fetch_reference",
      optional: true,
    })
  }

  if (input.useKnowledge) {
    steps.push({
      id: "knowledge",
      label: "関連ナレッジを確認",
      kind: "fetch_knowledge",
      optional: true,
    })
  }

  if (input.research.needed) {
    steps.push({
      id: "research",
      label: "必要な調査を実施",
      kind: "research",
      optional: false,
    })
  }

  if (input.needQuestions) {
    steps.push({
      id: "ask",
      label: "不足情報を確認",
      kind: "ask_user",
      optional: false,
    })
  }

  const structureLabel =
    input.intent.promptKind === "sales_material" ||
    input.intent.promptKind === "proposal"
      ? "営業構成を決定"
      : input.intent.promptKind === "contract"
        ? "条項構成を決定"
        : "文書構成を決定"

  steps.push(
    {
      id: "structure",
      label: structureLabel,
      kind: "structure",
      optional: false,
    },
    {
      id: "write",
      label: "内容を作成",
      kind: "write",
      optional: false,
    },
    {
      id: "review",
      label: "品質を確認",
      kind: "review",
      optional: false,
    },
    {
      id: "finalize",
      label: "仕上げ",
      kind: "finalize",
      optional: false,
    },
  )

  return steps
}
