import type { SecretaryAutonomyLevel } from "@/lib/secretary-intelligence/types"

export const SECRETARY_INTELLIGENCE_VERSION = "1.0.0"

/** Map automation-style levels → secretary autonomy when not explicit. */
export function resolveAutonomyLevel(
  raw: unknown,
  executionLevel?: string | null,
): SecretaryAutonomyLevel {
  if (raw === 1 || raw === 2 || raw === 3 || raw === 4) return raw
  if (typeof raw === "string") {
    const n = Number(raw)
    if (n === 1 || n === 2 || n === 3 || n === 4) return n
  }
  switch (executionLevel) {
    case "suggest_only":
      return 1
    case "draft_save":
      return 2
    case "approve_then_run":
      return 3
    case "full_auto":
      return 4
    default:
      return 2
  }
}

export const AUTONOMY_LABELS: Record<SecretaryAutonomyLevel, string> = {
  1: "必ず確認",
  2: "軽作業だけ自動",
  3: "投稿・送信まで自動",
  4: "完全自律",
}
