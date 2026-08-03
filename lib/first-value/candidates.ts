import type { DeliverableFormat } from "@/lib/deliverables/types";

export type FirstValueCandidateId =
  | "sales_deck"
  | "meeting_notes"
  | "email"
  | "image_analysis"
  | "receipt"
  | "invoice"
  | "word"
  | "excel"
  | "powerpoint";

export type FirstValueCandidate = {
  id: FirstValueCandidateId;
  label: string;
  description: string;
  defaultTitle: string;
  defaultContentHint: string;
  formats: DeliverableFormat[];
  /** Estimated minutes saved when done manually — clearly labeled as estimate. */
  estimatedMinutesSaved: number;
};

export const FIRST_VALUE_CANDIDATES: readonly FirstValueCandidate[] = [
  {
    id: "sales_deck",
    label: "営業資料",
    description: "提案の骨子を資料としてご用意します",
    defaultTitle: "営業提案資料",
    defaultContentHint: "提案先・強み・次のアクションを短く書いてください",
    formats: ["docx", "pdf"],
    estimatedMinutesSaved: 45,
  },
  {
    id: "meeting_notes",
    label: "議事録",
    description: "要点と決定事項を議事録にまとめます",
    defaultTitle: "議事録",
    defaultContentHint: "議題・参加者・決定事項を書いてください",
    formats: ["docx"],
    estimatedMinutesSaved: 30,
  },
  {
    id: "email",
    label: "メール",
    description: "丁寧なビジネスメール文面をご用意します",
    defaultTitle: "送付メール文面",
    defaultContentHint: "宛先の目的と伝えたい要点を書いてください",
    formats: ["docx", "txt"],
    estimatedMinutesSaved: 15,
  },
  {
    id: "image_analysis",
    label: "画像解析",
    description: "画像から読み取った内容を整理します",
    defaultTitle: "画像解析メモ",
    defaultContentHint: "解析したい内容の説明、または要点を書いてください",
    formats: ["docx"],
    estimatedMinutesSaved: 20,
  },
  {
    id: "receipt",
    label: "レシート",
    description: "経費メモとして金額と用途を整理します",
    defaultTitle: "レシート整理",
    defaultContentHint: "店名・日付・金額・用途を書いてください",
    formats: ["xlsx", "docx"],
    estimatedMinutesSaved: 10,
  },
  {
    id: "invoice",
    label: "請求書",
    description: "請求項目のたたき台をご用意します",
    defaultTitle: "請求書たたき台",
    defaultContentHint: "請求先・品目・金額を書いてください",
    formats: ["docx", "pdf"],
    estimatedMinutesSaved: 35,
  },
  {
    id: "word",
    label: "Word",
    description: "Word文書として仕上げます",
    defaultTitle: "業務メモ",
    defaultContentHint: "文書にしたい内容を書いてください",
    formats: ["docx"],
    estimatedMinutesSaved: 20,
  },
  {
    id: "excel",
    label: "Excel",
    description: "表形式で整理します",
    defaultTitle: "一覧表",
    defaultContentHint: "列と行にしたい内容を書いてください",
    formats: ["xlsx"],
    estimatedMinutesSaved: 25,
  },
  {
    id: "powerpoint",
    label: "PowerPoint",
    description: "プレゼン用のたたき台をご用意します",
    defaultTitle: "プレゼンたたき台",
    defaultContentHint: "伝えたいメッセージを書いてください",
    formats: ["pptx"],
    estimatedMinutesSaved: 40,
  },
] as const;

export function getFirstValueCandidate(
  id: string | null | undefined,
): FirstValueCandidate {
  return (
    FIRST_VALUE_CANDIDATES.find((c) => c.id === id) ??
    FIRST_VALUE_CANDIDATES[0]!
  );
}

export type FirstValueFrequency = "once" | "daily" | "weekly" | "monthly";

export const FIRST_VALUE_FREQUENCIES: Array<{
  id: FirstValueFrequency;
  label: string;
}> = [
  { id: "once", label: "今回だけ" },
  { id: "daily", label: "毎日" },
  { id: "weekly", label: "毎週" },
  { id: "monthly", label: "毎月" },
];
