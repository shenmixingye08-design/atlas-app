import type { ArtifactEvalCase } from "@/lib/artifact-durability/types";

/**
 * Build format-specific revision content. Not a noop append —
 * exercises the edit intents required by Phase 2 §9.
 */
export function buildRevisionContent(
  c: ArtifactEvalCase,
  requestId: string,
  revisionIndex: number
): { content: string; changeSummary: string } {
  const mod = revisionIndex % 3;
  if (c.format === "docx") {
    if (mod === 0) {
      return {
        changeSummary: "文言変更",
        content: `${c.content}\n\n## 改訂（文言変更）\n本文を更新しました。request=${requestId}\n結論を「再確認済み」に変更。\n`,
      };
    }
    if (mod === 1) {
      return {
        changeSummary: "表追加",
        content: `${c.content}\n\n## 改訂（表追加）\n| 項目 | 担当 | 期限 |\n| --- | --- | --- |\n| 追記A | ATLAS | 2026-08-10 |\n| 追記B | お客様 | 2026-08-15 |\n`,
      };
    }
    return {
      changeSummary: "画像追加メモ",
      content: `${c.content}\n\n## 改訂（画像追加）\n![改訂画像](revision://${requestId}.png)\n写真参照を追記しました。\n`,
    };
  }

  if (c.format === "xlsx") {
    if (mod === 0) {
      return {
        changeSummary: "列追加",
        content: `${c.content}\n\n| 品目 | 数量 | 金額 | 日付 | 新規列_粗利 |\n| --- | ---: | ---: | --- | ---: |\n| REV-${requestId.slice(-6)} | 9 | 900 | 2026-08-01 | 180 |\n`,
      };
    }
    if (mod === 1) {
      return {
        changeSummary: "数式追加",
        content: `${c.content}\n\n数式: 合計行に SUM と粗利率=粗利/金額 を追加してください。識別 ${requestId}\n`,
      };
    }
    return {
      changeSummary: "グラフ追加",
      content: `${c.content}\n\nグラフ: 数量と金額の棒グラフを追加。識別 ${requestId}\n`,
    };
  }

  if (c.format === "pdf") {
    if (mod === 0) {
      return {
        changeSummary: "ページ追加",
        content: `${c.content}\n\n## 追記ページ1\n追加本文 ${requestId}\n\n## 追記ページ2\n追加本文2 ${requestId}\n\n## 追記ページ3\n追加本文3\n`,
      };
    }
    if (mod === 1) {
      // Shorter body simulates page removal / condensation
      return {
        changeSummary: "ページ削除（圧縮）",
        content: `# ${c.title}（圧縮版）\n\n識別子改訂: ${requestId}\n\n## 要約のみ\n冗長ページを削除した短縮版です。\n`,
      };
    }
    return {
      changeSummary: "透かし追加",
      content: `${c.content}\n\n## 透かし\n【CONFIDENTIAL / 耐久試験 ${requestId}】\n透かし文言を全ページ相当で明示。\n`,
    };
  }

  // pptx
  if (mod === 0) {
    return {
      changeSummary: "スライド追加",
      content: `${c.content}\n\n## スライド追加: 改訂アクション\n- 追加スライド ${requestId}\n- 次の一歩\n`,
    };
  }
  if (mod === 1) {
    return {
      changeSummary: "文章短縮",
      content: `# ${c.title}\n\n識別子: ${requestId}\n\n## スライド1: 要点のみ\n- 短縮版\n\n## スライド2: 結論\n- 完了\n`,
    };
  }
  return {
    changeSummary: "画像差し替え",
    content: `${c.content}\n\n## 画像差し替え\n- 旧画像を revision://${requestId}.png に差し替え\n- 比率維持\n`,
  };
}
