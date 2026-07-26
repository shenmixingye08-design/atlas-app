import type {
  RiskActionKind,
  RiskCheckResult,
  RiskDisposition,
  SecretaryAutonomyLevel,
} from "@/lib/secretary-intelligence/types"

const ACTION_PATTERNS: Array<{ kind: RiskActionKind; re: RegExp }> = [
  {
    kind: "send",
    re: /送信して|メールを?送|send\s*(mail|email)/i,
  },
  {
    kind: "publish",
    re: /投稿して|公開して|wordpress|ツイート|SNS投稿/i,
  },
  {
    kind: "delete",
    re: /削除して|消去|ゴミ箱|delete/i,
  },
  {
    kind: "contract",
    re: /契約(書|を結|締結)|NDA|秘密保持/i,
  },
  {
    kind: "payment",
    re: /決済|支払い|課金|stripe|チャージ/i,
  },
]

function dispositionFor(
  actions: readonly RiskActionKind[],
  autonomy: SecretaryAutonomyLevel,
): { disposition: RiskDisposition; requiresConfirmation: boolean; reasons: string[] } {
  if (actions.length === 0 || (actions.length === 1 && actions[0] === "none")) {
    return { disposition: "auto", requiresConfirmation: false, reasons: [] }
  }

  const reasons = actions.map((a) => {
    switch (a) {
      case "send":
        return "送信操作を含みます"
      case "publish":
        return "公開・投稿操作を含みます"
      case "delete":
        return "削除操作を含みます"
      case "contract":
        return "契約関連の成果物です"
      case "payment":
        return "決済・支払い操作を含みます"
      default:
        return "重要操作"
    }
  })

  const hasHard = actions.some((a) => a === "delete" || a === "payment")

  if (autonomy === 1) {
    return { disposition: "confirm", requiresConfirmation: true, reasons }
  }
  if (autonomy === 2) {
    return { disposition: "confirm", requiresConfirmation: true, reasons }
  }
  if (autonomy === 3) {
    if (hasHard) {
      return {
        disposition: "confirm",
        requiresConfirmation: true,
        reasons: [...reasons, "Level3でも削除・決済は確認が必要"],
      }
    }
    return {
      disposition: "auto",
      requiresConfirmation: false,
      reasons: [...reasons, "Level3: 投稿・送信は自動可"],
    }
  }
  // Level 4
  if (hasHard) {
    return {
      disposition: "confirm",
      requiresConfirmation: true,
      reasons: [...reasons, "完全自律でも削除・決済は確認"],
    }
  }
  return {
    disposition: "auto",
    requiresConfirmation: false,
    reasons,
  }
}

/** Risk check for irreversible actions — no LLM. */
export function checkRisk(input: {
  assignment: string
  autonomyLevel: SecretaryAutonomyLevel
}): RiskCheckResult {
  const actions: RiskActionKind[] = []
  for (const { kind, re } of ACTION_PATTERNS) {
    if (re.test(input.assignment)) actions.push(kind)
  }
  if (actions.length === 0) actions.push("none")

  const { disposition, requiresConfirmation, reasons } = dispositionFor(
    actions,
    input.autonomyLevel,
  )

  return {
    actions: actions.filter((a) => a !== "none"),
    disposition,
    reasons,
    requiresConfirmation,
  }
}
