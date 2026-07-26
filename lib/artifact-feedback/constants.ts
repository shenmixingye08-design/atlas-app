export const NEGATIVE_REASON_OPTIONS = [
  "内容が足りない",
  "内容が多すぎる",
  "指示と違う",
  "情報が間違っている",
  "文章が読みにくい",
  "見た目が良くない",
  "専門性が足りない",
  "同じ内容が重複している",
  "ファイル形式やレイアウトに問題がある",
  "その他",
] as const

export const POSITIVE_REASON_OPTIONS = [
  "そのまま使えた",
  "修正がほとんど不要だった",
  "内容が分かりやすかった",
  "専門性が高かった",
  "見た目が良かった",
  "会社らしさが出ていた",
  "想像以上だった",
] as const

export const MIN_IMPROVEMENT_EVIDENCE = 3

export const DIVERGENCE_HIGH_SCORE = 90
export const DIVERGENCE_LOW_SCORE = 60
