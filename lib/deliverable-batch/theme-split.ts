import { sanitizeUserItemText } from "./safety";
import type { DeliverableBatchItemInput } from "./types";

const ANGLE_TEMPLATES = [
  "基本の案内",
  "よくある質問への答え",
  "今日の実務のコツ",
  "注意点と避けたいこと",
  "始める前の準備",
  "続け方の工夫",
  "失敗しやすい点",
  "確認チェック",
  "次の一歩",
  "短いまとめ",
  "現場での使い方",
  "振り返り",
];

/**
 * Deterministic, non-duplicating theme split.
 * Does not invent company facts — only angles on the shared instruction.
 */
export function splitThemesDeterministically(
  sharedInstruction: string,
  count: number,
): DeliverableBatchItemInput[] {
  const base = sanitizeUserItemText(sharedInstruction) || "依頼内容";
  return Array.from({ length: count }, (_, index) => {
    const angle = ANGLE_TEMPLATES[index % ANGLE_TEMPLATES.length] ?? `切り口${index + 1}`;
    const title = `${base.slice(0, 24)}（${angle}）`.slice(0, 80);
    return {
      title,
      theme: angle,
      instruction: `${base}。切り口は「${angle}」。他の案と同じ導入・同じCTAにしない。`,
    };
  });
}
