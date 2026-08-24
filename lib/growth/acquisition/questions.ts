export const DIAGNOSIS_QUESTIONS = [
  {
    id: "repeatWork",
    label: "毎週・毎月繰り返している作業は何ですか",
    options: [
      { id: "sns" as const, label: "XやSNSの投稿" },
      { id: "documents" as const, label: "資料・提案の下書き" },
      { id: "schedule" as const, label: "予定とタスクの整理" },
      { id: "admin" as const, label: "同じ事務作業" },
      { id: "mixed" as const, label: "いくつか混ざっている" },
    ],
  },
  {
    id: "heaviest",
    label: "一番時間がかかっている作業は何ですか",
    options: [
      { id: "sns" as const, label: "投稿文を考えること" },
      { id: "documents" as const, label: "資料の構成を考えること" },
      { id: "schedule" as const, label: "今日やることを並べること" },
      { id: "admin" as const, label: "同じ作業を毎回やり直すこと" },
      { id: "mixed" as const, label: "特定できない" },
    ],
  },
  {
    id: "tool",
    label: "主に使うツールは何ですか",
    options: [
      { id: "x" as const, label: "X" },
      { id: "office" as const, label: "Word / Excel / スライド" },
      { id: "calendar" as const, label: "カレンダーやメモ" },
      { id: "email" as const, label: "メール" },
      { id: "mixed" as const, label: "複数" },
    ],
  },
  {
    id: "frequency",
    label: "その作業はどのくらいの頻度ですか",
    options: [
      { id: "daily" as const, label: "ほぼ毎日" },
      { id: "weekly" as const, label: "週に数回" },
      { id: "monthly" as const, label: "月に数回" },
    ],
  },
  {
    id: "firstCut",
    label: "最初に減らしたい作業は何ですか",
    options: [
      { id: "sns" as const, label: "X投稿" },
      { id: "documents" as const, label: "資料のアウトライン" },
      { id: "schedule" as const, label: "今日の整理" },
      { id: "admin" as const, label: "定期作業の自動化" },
    ],
  },
] as const;
