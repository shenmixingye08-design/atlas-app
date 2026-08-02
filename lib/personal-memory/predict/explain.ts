import type { PersonalMemoryRecord } from "@/lib/personal-memory/types";
import type { MemoryResolveLayer } from "@/lib/personal-memory/types";

/**
 * Human-readable explanation for why a Memory was predicted.
 * Deterministic — no LLM.
 */
export function explainPrediction(input: {
  memory: PersonalMemoryRecord;
  layer: MemoryResolveLayer;
  evidenceCount: number;
  evidenceTotal: number;
  workCategory?: string | null;
}): string {
  const category = input.workCategory?.trim() || null;
  const title = input.memory.title || input.memory.summary;
  const count = Math.max(input.evidenceCount, 1);
  const total = Math.max(input.evidenceTotal, count);
  const rate = Math.round((count / total) * 100);

  if (input.layer === "current_instruction") {
    return `今回の明示指示に「${title}」が含まれているため適用します。`;
  }
  if (input.layer === "automation_memory" || input.layer === "automation_override") {
    return `この Automation 専用の好み「${title}」として登録されているため適用します。`;
  }
  if (input.layer === "company_memory") {
    return `この会社向けの成果物では「${title}」が標準のため適用します。`;
  }
  if (input.layer === "deliverable_category" && category) {
    return `${category}で過去${total}件中${count}件（${rate}%）「${title}」だったため適用します。`;
  }
  if (rate >= 100 && total >= 2) {
    return `「${title}」は過去${total}件で100%選択されているため適用します。`;
  }
  if (input.layer === "global_memory") {
    return `全体の標準設定「${title}」として覚えており、矛盾する指示がないため適用します。`;
  }
  if (input.layer === "system_inference") {
    return `修正履歴から「${title}」の傾向が見えるため候補として提案します（確認推奨）。`;
  }
  return `過去の成果物傾向から「${title}」を適用します（根拠 ${count}/${total}）。`;
}

export function buildEvidenceSummary(input: {
  workCategory?: string | null;
  evidenceTotal: number;
  autoApplyCount: number;
}): string {
  const cat = input.workCategory?.trim();
  if (cat && input.evidenceTotal > 0) {
    return `過去${input.evidenceTotal}件の成果物から以下を適用します。`;
  }
  if (input.autoApplyCount > 0) {
    return `覚えている好みから以下を適用します。`;
  }
  return `適用できる確度の高い好みはまだ少ないため、確認をお願いします。`;
}

export function buildPredictionHeadline(input: {
  workCategory?: string | null;
  notes?: string | null;
}): string {
  const cat = input.workCategory?.trim();
  if (cat) return `${cat}ですね。`;
  const notes = (input.notes ?? "").trim();
  if (/営業|sales/i.test(notes)) return `営業資料ですね。`;
  if (/SNS|ツイート|X投稿/i.test(notes)) return `SNS投稿ですね。`;
  if (/ブログ|blog/i.test(notes)) return `ブログ記事ですね。`;
  if (notes.length > 0) return `いつもの進め方でご用意します。`;
  return `いつもの好みを先回りします。`;
}
