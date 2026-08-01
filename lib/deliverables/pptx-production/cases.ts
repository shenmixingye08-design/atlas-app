export type PptxProductionCase = {
  id: string;
  category:
    | "営業資料"
    | "会社紹介"
    | "企画書"
    | "月次報告"
    | "プレゼン"
    | "研修資料"
    | "IR風資料"
    | "写真付き資料"
    | "グラフ中心"
    | "長文資料";
  fileName: string;
  content: string;
  expectCharts?: boolean;
  expectTables?: boolean;
  expectImages?: boolean;
  aspectRatio?: "16:9" | "4:3";
};

function table(headers: string[], rows: string[][]): string {
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  return `| ${headers.join(" | ")} |\n${sep}\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;
}

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";

export function buildPptxProductionCases(): PptxProductionCase[] {
  const cases: PptxProductionCase[] = [];

  for (let i = 0; i < 12; i += 1) {
    cases.push({
      id: `sales_${i}`,
      category: "営業資料",
      fileName: `営業資料_${i}`,
      content: `# 営業提案書 ${i + 1}

## 課題認識

お客様の業務負荷を減らすことが最優先です。

## 提案概要

- 習慣作業の自動化
- 資料作成の標準化
- 進捗の見える化

## 効果試算

${table(
  ["指標", "現状", "導入後"],
  [
    ["資料作成時間", "8", "2"],
    ["手戻り件数", "12", "3"],
    ["承認リードタイム", "5", "1"],
  ],
)}
`,
      expectTables: true,
      expectCharts: true,
    });
  }

  for (let i = 0; i < 10; i += 1) {
    cases.push({
      id: `company_${i}`,
      category: "会社紹介",
      fileName: `会社紹介_${i}`,
      content: `# 会社紹介

## ミッション

お客様の時間を生み出す専属AI秘書を提供します。

## 沿革

1. 構想開始
2. ベータ提供
3. 正式提供
4. 機能拡張
5. 企業導入拡大

## 数字で見る実績

${table(
  ["項目", "値"],
  [
    ["導入企業", `${50 + i}`],
    ["月間成果物", `${1000 + i * 10}`],
    ["継続率", `${90 + (i % 5)}%`],
  ],
)}
`,
      expectTables: true,
    });
  }

  for (let i = 0; i < 10; i += 1) {
    cases.push({
      id: `plan_${i}`,
      category: "企画書",
      fileName: `企画書_${i}`,
      content: `# 新規企画書

## 背景

市場ニーズの変化に対応します。

## 施策

- チャネル拡大
- コンテンツ強化
- パートナー連携

## KPI

${table(
  ["KPI", "目標"],
  [
    ["リード", `${100 + i}`],
    ["商談化率", "25%"],
    ["受注", `${20 + i}`],
  ],
)}
`,
      expectTables: true,
    });
  }

  for (let i = 0; i < 10; i += 1) {
    cases.push({
      id: `monthly_${i}`,
      category: "月次報告",
      fileName: `月次報告_${i}`,
      content: `# 月次報告 2026-${String((i % 12) + 1).padStart(2, "0")}

## ハイライト

今月の進捗を共有します。

## 売上

${table(
  ["部門", "売上"],
  [
    ["営業", `${120 + i}`],
    ["開発", `${80 + i}`],
    ["サポート", `${40 + i}`],
  ],
)}

## 課題

- 納期遵守
- 品質向上
`,
      expectTables: true,
      expectCharts: true,
    });
  }

  for (let i = 0; i < 10; i += 1) {
    cases.push({
      id: `preso_${i}`,
      category: "プレゼン",
      fileName: `プレゼン_${i}`,
      content: `# プレゼン資料

## 本日のゴール

意思決定に必要な情報を揃えます。

## アジェンダ詳細

1. 現状
2. 選択肢
3. 推奨案
4. 次アクション

## 推奨案

推奨案のポイントを簡潔に説明します。全角・半角の混在も確認します。
`,
      aspectRatio: i % 2 === 0 ? "16:9" : "4:3",
    });
  }

  for (let i = 0; i < 8; i += 1) {
    cases.push({
      id: `training_${i}`,
      category: "研修資料",
      fileName: `研修資料_${i}`,
      content: `# 研修資料

## 学習目標

操作手順を理解し、実務で再現できるようにします。

## 手順

1. ログイン
2. 案件選択
3. 成果物確認
4. フィードバック
5. 完了

## 確認テスト

${table(["No", "設問"], [["1", "目的は何か"], ["2", "次の操作は何か"]])}
`,
      expectTables: true,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    cases.push({
      id: `ir_${i}`,
      category: "IR風資料",
      fileName: `IR資料_${i}`,
      content: `# 事業概況

## 業績サマリー

${table(
  ["指標", "今期", "前期"],
  [
    ["売上", `${500 + i}`, `${450 + i}`],
    ["営業利益", `${80 + i}`, `${70 + i}`],
    ["経常利益", `${60 + i}`, `${55 + i}`],
  ],
)}

## 成長戦略

成長領域への集中投資を継続します。
`,
      expectTables: true,
      expectCharts: true,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    cases.push({
      id: `photo_${i}`,
      category: "写真付き資料",
      fileName: `写真資料_${i}`,
      content: `# 現場報告

## 概要

現場の状況を共有します。

![現場${i + 1}](${TINY_PNG})

## 所見

安全対策は問題ありません。
`,
      expectImages: true,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    cases.push({
      id: `chart_${i}`,
      category: "グラフ中心",
      fileName: `グラフ中心_${i}`,
      content: `# 分析レポート

## カテゴリ別

${table(
  ["カテゴリ", "金額", "件数"],
  [
    ["A", `${100 + i}`, "3"],
    ["B", `${80 + i}`, "5"],
    ["C", `${60 + i}`, "2"],
    ["D", `${40 + i}`, "4"],
  ],
)}

## 比較表

${table(
  ["月", "計画", "実績"],
  [
    ["1月", "100", `${90 + i}`],
    ["2月", "110", `${100 + i}`],
    ["3月", "120", `${115 + i}`],
  ],
)}
`,
      expectCharts: true,
      expectTables: true,
    });
  }

  cases.push({
    id: "long_deck",
    category: "長文資料",
    fileName: "長文資料",
    content: `# 長文プレゼン

${Array.from({ length: 12 }, (_, i) => `## 章 ${i + 1}\n\nこれは長文の説明です。句読点、禁則、改行、視認性を確認します。\n\n- 要点A-${i}\n- 要点B-${i}\n`).join("\n")}`,
  });

  let pad = 0;
  while (cases.length < 100) {
    cases.push({
      id: `pad_sales_${pad}`,
      category: "営業資料",
      fileName: `営業追加_${pad}`,
      content: `# 追加営業資料 ${pad}

## 要点

追加ケース ${pad} です。

${table(["項目", "値"], [["スコア", `${10 + pad}`], ["件数", `${3 + pad}`]])}
`,
      expectTables: true,
      expectCharts: true,
    });
    pad += 1;
  }

  return cases;
}
