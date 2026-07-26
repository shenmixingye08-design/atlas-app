import type { ArtifactFeedbackRecord } from "@/lib/artifact-feedback/types"

export type ArtifactFeedbackExportRow = {
  rating: string
  artifactType: string
  createdAt: string
  qualityScore: number | null
  model: string | null
  promptVersion: string | null
  templateVersion: string | null
  knowledgeVersion: string | null
  regenerationCount: number | null
  apiCost: number | null
  reasons: string
  comment: string
  downloaded: boolean | null
  finalUsed: boolean | null
}

/** 個人情報・本文を含めない安全なエクスポート行 */
export function toExportRows(
  records: readonly ArtifactFeedbackRecord[],
): ArtifactFeedbackExportRow[] {
  return records.map((r) => ({
    rating: r.ratingType === "positive" ? "positive" : "negative",
    artifactType: r.artifactType ?? "",
    createdAt: r.createdAt,
    qualityScore: r.qualityScore,
    model: r.model,
    promptVersion: r.promptVersion,
    templateVersion: r.templateVersion,
    knowledgeVersion: r.knowledgeVersion,
    regenerationCount: r.regenerationCount,
    apiCost: r.totalApiCost,
    reasons: [...r.positiveReasons, ...r.negativeReasons].join("|"),
    comment: r.comment ?? "",
    downloaded: r.downloaded,
    finalUsed: r.finalUsed,
  }))
}

export function toCsv(rows: readonly ArtifactFeedbackExportRow[]): string {
  const headers = [
    "評価",
    "成果物種類",
    "作成日時",
    "Quality Score",
    "Model",
    "Prompt Version",
    "Template Version",
    "Knowledge Version",
    "再生成回数",
    "API原価",
    "評価理由",
    "コメント",
    "ダウンロード",
    "最終利用",
  ] as const

  const escape = (v: string | number | boolean | null) => {
    const s = v == null ? "" : String(v)
    return `"${s.replace(/"/g, '""')}"`
  }

  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.rating,
        r.artifactType,
        r.createdAt,
        r.qualityScore,
        r.model,
        r.promptVersion,
        r.templateVersion,
        r.knowledgeVersion,
        r.regenerationCount,
        r.apiCost,
        r.reasons,
        r.comment,
        r.downloaded,
        r.finalUsed,
      ]
        .map(escape)
        .join(","),
    ),
  ]
  return lines.join("\n")
}

/** デフォルト出力に個人情報・本文ヘッダーが含まれないこと */
export function assertNoPiiInExport(csvOrJson: string): boolean {
  const lower = csvOrJson.toLowerCase()
  const forbiddenHeaders = [
    "email",
    "メール",
    "password",
    "本文",
    "body",
    "content",
    "userid",
    "user_id",
    "organizationid",
  ]
  return !forbiddenHeaders.some(
    (f) =>
      lower.includes(`"${f}"`) ||
      lower.startsWith(`${f},`) ||
      lower.includes(`,${f},`) ||
      lower.includes(`,${f}\n`),
  )
}
