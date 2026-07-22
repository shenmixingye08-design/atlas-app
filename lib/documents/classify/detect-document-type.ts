import type { DocumentType } from "@/lib/documents/schema/enums";

const TYPE_RULES: readonly { type: DocumentType; patterns: RegExp[] }[] = [
  { type: "minutes", patterns: [/議事録/, /会議/, /ミーティング/, /meeting minutes/i] },
  { type: "proposal", patterns: [/提案/, /企画書/, /proposal/i, /pitch/i] },
  { type: "plan", patterns: [/計画/, /プラン/, /plan/i, /ロードマップ/] },
  { type: "report", patterns: [/報告/, /レポート/, /report/i, /白書/] },
  { type: "research", patterns: [/調査/, /リサーチ/, /research/i, /分析結果/] },
  { type: "manual", patterns: [/マニュアル/, /手順/, /操作/, /manual/i, /ガイド/] },
  { type: "sales", patterns: [/営業/, /セールス/, /sales/i, /見込み客/] },
  { type: "comparison", patterns: [/比較/, /comparison/i, /vs\.?/, /対照/] },
  { type: "estimate", patterns: [/見積/, /見積書/, /estimate/i, /quotation/i] },
  { type: "schedule", patterns: [/スケジュール/, /日程/, /schedule/i, /タイムライン/] },
  { type: "list", patterns: [/一覧/, /リスト/, /list/i, /チェックリスト/] },
];

/** Rule-based document type detection — zero AI. */
export function detectDocumentType(text: string, title?: string): DocumentType {
  const haystack = `${title ?? ""}\n${text}`.slice(0, 4000);
  for (const rule of TYPE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(haystack))) {
      return rule.type;
    }
  }
  return "general";
}
