import type { QualityPromptKind } from "../types";

import type { SpecialistProfile } from "./types";

const SALES: SpecialistProfile = {
  kind: "sales_material",
  label: "営業資料AI",
  judgeFocus: "営業力",
  judgeWeights: {
    persuasiveness: 1.6,
    structure: 1.3,
    design: 1.2,
    readability: 1.2,
    completeness: 1.1,
    naturalness: 1.1,
    expertise: 1.0,
    information: 1.0,
  },
  writerPriorities: [
    "最初の1ページで興味を引く",
    "課題→解決→メリット→CTA",
    "読みやすい構成",
    "説得力のある自然な営業文章",
    "図表を活かせる構成",
  ],
  reviewerChecks: [
    "冒頭で興味を引けているか",
    "課題→解決→メリット→CTA の流れがあるか",
    "営業文章として自然か",
    "CTAが明確か",
    "図表・箇条書きで読みやすいか",
  ],
  writerInstructions:
    "営業資料専門。表紙で興味を引き、課題→解決→メリット→CTA。捏造数値禁止。Business Profile反映。",
  layoutHints: "スライド想定。1セクション=1メッセージ。箇条書きと対比表を活用。",
};

const PROPOSAL: SpecialistProfile = {
  kind: "proposal",
  label: "提案書AI",
  judgeFocus: "提案力",
  judgeWeights: {
    persuasiveness: 1.5,
    structure: 1.3,
    expertise: 1.3,
    completeness: 1.2,
    information: 1.1,
    readability: 1.1,
    naturalness: 1.0,
    design: 1.0,
  },
  writerPriorities: [
    "課題の明確化",
    "具体的な解決策",
    "実施計画と期待効果",
    "意思決定しやすいまとめ",
  ],
  reviewerChecks: [
    "提案の論理が一貫しているか",
    "実施計画が具体的か",
    "期待効果が誇張しすぎていないか",
  ],
  writerInstructions:
    "提案書専門。背景→課題→提案→計画→効果。説得力と実現性のバランス。",
  layoutHints: "見出し階層を明確に。数値は表で整理。",
};

const PLANNING: SpecialistProfile = {
  kind: "planning",
  label: "企画書AI",
  judgeFocus: "企画力",
  judgeWeights: {
    structure: 1.4,
    persuasiveness: 1.3,
    information: 1.2,
    completeness: 1.2,
    expertise: 1.1,
    readability: 1.1,
    design: 1.0,
    naturalness: 1.0,
  },
  writerPriorities: [
    "企画の目的とゴール",
    "ターゲットと提供価値",
    "施策案と優先順位",
    "スケジュールとKPI",
  ],
  reviewerChecks: [
    "目的と施策が対応しているか",
    "KPIが測定可能か",
    "スケジュールに無理がないか",
  ],
  writerInstructions:
    "企画書専門。目的→ターゲット→施策→体制→KPI→スケジュール。",
  layoutHints: "施策は番号付き。優先度を明示。",
};

const CONTRACT: SpecialistProfile = {
  kind: "contract",
  label: "契約書AI",
  judgeFocus: "整合性",
  judgeWeights: {
    structure: 1.6,
    completeness: 1.5,
    expertise: 1.4,
    naturalness: 1.2,
    readability: 1.1,
    information: 1.1,
    persuasiveness: 0.6,
    design: 0.7,
  },
  writerPriorities: [
    "条項漏れ防止",
    "番号整合",
    "自然な法務文章",
    "読みやすさ",
  ],
  reviewerChecks: [
    "条項番号が連番で整合しているか",
    "定義・義務・解除が欠けていないか",
    "曖昧な表現や未完成プレースホルダがないか",
    "法務文章として自然か",
  ],
  writerInstructions:
    "契約書専門。条項を番号付きで。不明点は【要確認】。過度な法的断定を避ける。",
  layoutHints: "第○条形式。定義→本体→雑則の順。",
};

const ESTIMATE: SpecialistProfile = {
  kind: "estimate",
  label: "見積書AI",
  judgeFocus: "明確さ",
  judgeWeights: {
    completeness: 1.5,
    structure: 1.4,
    information: 1.4,
    readability: 1.2,
    expertise: 1.1,
    design: 1.0,
    naturalness: 0.9,
    persuasiveness: 0.8,
  },
  writerPriorities: [
    "明細の明確さ",
    "前提条件の明示",
    "有効期限",
    "合計の整合",
  ],
  reviewerChecks: [
    "品目・数量・単価が揃っているか",
    "前提条件・有効期限があるか",
    "金額の捏造がないか（不明は要確認）",
  ],
  writerInstructions:
    "見積書専門。明細・前提・有効期限・合計。不明金額は捏造せず【要確認】。",
  layoutHints: "表形式の明細。小計・税・合計を分離。",
};

const INVOICE: SpecialistProfile = {
  kind: "invoice",
  label: "請求書AI",
  judgeFocus: "正確さ",
  judgeWeights: {
    completeness: 1.6,
    structure: 1.4,
    information: 1.4,
    expertise: 1.2,
    readability: 1.1,
    design: 1.0,
    naturalness: 0.9,
    persuasiveness: 0.5,
  },
  writerPriorities: [
    "発行者・宛先・番号",
    "明細と税計算",
    "支払条件",
  ],
  reviewerChecks: [
    "請求書ヘッダ必須項目があるか",
    "明細と合計が対応しているか",
    "支払期限・振込先があるか（不明は要確認）",
  ],
  writerInstructions:
    "請求書専門。ヘッダ・明細・税・合計・支払条件。不明は【要確認】。",
  layoutHints: "帳票レイアウト。金額は右寄せ想定で記載。",
};

const WORD: SpecialistProfile = {
  kind: "word",
  label: "Word AI",
  judgeFocus: "文書体裁",
  judgeWeights: {
    structure: 1.5,
    readability: 1.4,
    design: 1.3,
    naturalness: 1.2,
    completeness: 1.1,
    information: 1.0,
    expertise: 1.0,
    persuasiveness: 0.9,
  },
  writerPriorities: [
    "見出し階層",
    "余白と段落",
    "改ページの意識",
    "表・箇条書き",
  ],
  reviewerChecks: [
    "見出し階層（H1/H2/H3）が崩れていないか",
    "箇条書き・表が適切か",
    "段落が長すぎないか",
    "改ページ・区切りの指示があるか",
  ],
  writerInstructions:
    "Word文書専門。文章だけでなく見出し階層・余白・改ページ・表・箇条書きを設計。",
  layoutHints:
    "markdownで見出し階層を厳守。長い章の前に「（改ページ推奨）」を注記可。表はパイプ表。",
};

const EXCEL: SpecialistProfile = {
  kind: "excel",
  label: "Excel AI",
  judgeFocus: "実用性",
  judgeWeights: {
    structure: 1.6,
    information: 1.5,
    completeness: 1.4,
    expertise: 1.2,
    design: 1.2,
    readability: 1.1,
    naturalness: 0.7,
    persuasiveness: 0.5,
  },
  writerPriorities: [
    "列構成",
    "セル結合の方針",
    "数式",
    "色分け",
    "テーブル化",
  ],
  reviewerChecks: [
    "列名が一意で実用的か",
    "数式・計算前提が書かれているか",
    "テーブル化できる行データがあるか",
    "色分け・区分の指針があるか",
  ],
  writerInstructions:
    "Excel専門。列構成・行データ・数式・色分け・テーブル化まで設計。計算前提を注記。",
  layoutHints:
    "スキーマ表＋データ表。数式例は `=SUM()` 形式。結合セルはヘッダのみ推奨と明記。",
};

const PDF: SpecialistProfile = {
  kind: "pdf",
  label: "PDF AI",
  judgeFocus: "印刷品質",
  judgeWeights: {
    design: 1.5,
    structure: 1.4,
    readability: 1.4,
    completeness: 1.1,
    information: 1.0,
    naturalness: 1.0,
    expertise: 1.0,
    persuasiveness: 0.9,
  },
  writerPriorities: [
    "読みやすいレイアウト",
    "ページ構成",
    "印刷品質",
  ],
  reviewerChecks: [
    "ページ構成（表紙→本文→まとめ）があるか",
    "印刷しても読みやすい分量か",
    "余白・見出しが適切か",
  ],
  writerInstructions:
    "PDF専門。表紙・本文・まとめ。印刷を意識したレイアウト構成。",
  layoutHints: "1ページ相当の塊を意識。図表キャプションを付ける。",
};

const BLOG: SpecialistProfile = {
  kind: "blog",
  label: "ブログAI",
  judgeFocus: "SEO",
  judgeWeights: {
    readability: 1.5,
    structure: 1.4,
    information: 1.3,
    completeness: 1.2,
    naturalness: 1.2,
    persuasiveness: 1.0,
    expertise: 1.1,
    design: 0.9,
  },
  writerPriorities: [
    "検索意図",
    "SEO構成",
    "見出し",
    "読みやすさ",
    "まとめ",
  ],
  reviewerChecks: [
    "検索意図に答える構成か",
    "SEO title/description/tags があるか",
    "見出しがスキャンしやすいか",
    "まとめがあるか",
  ],
  writerInstructions:
    "ブログ専門。検索意図→導入→見出し本文→具体例→まとめ。seo/tags/snsPostを埋める。",
  layoutHints: "H2中心。導入は短く。まとめに次アクション。",
};

const SNS: SpecialistProfile = {
  kind: "sns",
  label: "SNS投稿AI",
  judgeFocus: "反応しやすさ",
  judgeWeights: {
    persuasiveness: 1.4,
    naturalness: 1.4,
    readability: 1.3,
    completeness: 1.0,
    structure: 1.0,
    information: 0.9,
    design: 0.9,
    expertise: 0.8,
  },
  writerPriorities: ["フック", "簡潔さ", "トーン統一", "行動喚起"],
  reviewerChecks: [
    "3〜5本あるか",
    "トーンが統一されているか",
    "ハッシュタグが過剰でないか",
  ],
  writerInstructions: "SNS専門。3〜5本。フックとCTA。過度なハッシュタグ禁止。",
  layoutHints: "投稿ごとに番号。文字数目安を併記可。",
};

const RECEIPT: SpecialistProfile = {
  kind: "receipt",
  label: "レシートAI",
  judgeFocus: "正確さ",
  judgeWeights: {
    information: 1.6,
    completeness: 1.5,
    expertise: 1.2,
    structure: 1.1,
    readability: 1.0,
    naturalness: 0.8,
    design: 0.7,
    persuasiveness: 0.4,
  },
  writerPriorities: ["Vision整合", "日付・店名・金額", "科目分類"],
  reviewerChecks: [
    "Vision結果と矛盾していないか",
    "日付・金額があるか",
    "不明点を要確認にしているか",
  ],
  writerInstructions:
    "レシート/家計簿専門。Visionと矛盾禁止。日付・店名・金額・科目。",
  layoutHints: "表形式の家計簿行。",
};

const MINUTES: SpecialistProfile = {
  kind: "minutes",
  label: "議事録AI",
  judgeFocus: "記録精度",
  judgeWeights: {
    completeness: 1.5,
    structure: 1.4,
    information: 1.4,
    readability: 1.2,
    naturalness: 1.1,
    expertise: 1.0,
    design: 0.8,
    persuasiveness: 0.5,
  },
  writerPriorities: [
    "出席者と日時",
    "議題と決定事項",
    "アクションアイテム（担当・期限）",
  ],
  reviewerChecks: [
    "決定事項が明確か",
    "ToDoに担当と期限があるか",
    "議題の抜けがないか",
  ],
  writerInstructions:
    "議事録専門。日時・出席者・議題・議論要約・決定・宿題。推測で発言を作らない。",
  layoutHints: "決定と宿題を表で分離。",
};

const EMAIL: SpecialistProfile = {
  kind: "email",
  label: "メールAI",
  judgeFocus: "返信しやすさ",
  judgeWeights: {
    naturalness: 1.5,
    readability: 1.4,
    persuasiveness: 1.2,
    completeness: 1.1,
    structure: 1.1,
    expertise: 1.0,
    information: 1.0,
    design: 0.7,
  },
  writerPriorities: [
    "宛先に合わせた敬語",
    "件名最適化",
    "簡潔さ",
    "返信しやすさ",
  ],
  reviewerChecks: [
    "件名が具体的か",
    "敬語が宛先に合っているか",
    "一文が長すぎないか",
    "次のアクションが明確か",
  ],
  writerInstructions:
    "メール専門。件名→挨拶→用件→依頼/確認→締め。簡潔で返信しやすい。",
  layoutHints: "件名を先頭に。本文は短段落。",
};

const REPORT: SpecialistProfile = {
  kind: "report",
  label: "レポートAI",
  judgeFocus: "分析力",
  judgeWeights: {
    expertise: 1.4,
    information: 1.4,
    structure: 1.3,
    completeness: 1.2,
    readability: 1.1,
    persuasiveness: 1.0,
    naturalness: 1.0,
    design: 0.9,
  },
  writerPriorities: ["結論先出し", "根拠", "提言", "リスク"],
  reviewerChecks: [
    "結論が先にあるか",
    "根拠と提言が対応しているか",
  ],
  writerInstructions: "レポート専門。要約→分析→提言→補足。",
  layoutHints: "図表参照を明示。",
};

const GENERIC: SpecialistProfile = {
  kind: "generic",
  label: "汎用成果物AI",
  judgeFocus: "完成度",
  judgeWeights: {
    completeness: 1.2,
    readability: 1.2,
    structure: 1.2,
    naturalness: 1.1,
    information: 1.1,
    expertise: 1.0,
    persuasiveness: 1.0,
    design: 1.0,
  },
  writerPriorities: ["目的", "読者", "次アクション"],
  reviewerChecks: ["目的が明確か", "次アクションがあるか"],
  writerInstructions: "汎用成果物。目的・読者・次アクションを明確に。",
  layoutHints: "見出しと箇条書きで整理。",
};

const REGISTRY: Record<QualityPromptKind, SpecialistProfile> = {
  sales_material: SALES,
  proposal: PROPOSAL,
  planning: PLANNING,
  contract: CONTRACT,
  estimate: ESTIMATE,
  invoice: INVOICE,
  word: WORD,
  excel: EXCEL,
  pdf: PDF,
  blog: BLOG,
  sns: SNS,
  receipt: RECEIPT,
  minutes: MINUTES,
  email: EMAIL,
  report: REPORT,
  generic: GENERIC,
};

export const ALL_QUALITY_PROMPT_KINDS = Object.keys(
  REGISTRY,
) as QualityPromptKind[];

export function getSpecialistProfile(
  kind: QualityPromptKind,
): SpecialistProfile {
  return REGISTRY[kind] ?? GENERIC;
}

export function listSpecialistProfiles(): readonly SpecialistProfile[] {
  return ALL_QUALITY_PROMPT_KINDS.map((kind) => REGISTRY[kind]);
}
