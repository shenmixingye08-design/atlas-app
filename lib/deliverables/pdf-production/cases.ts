export type PdfProductionCase = {
  id: string;
  category:
    | "報告書"
    | "契約書"
    | "見積書"
    | "請求書"
    | "写真付き報告書"
    | "仕様書"
    | "議事録"
    | "マニュアル"
    | "長文"
    | "表中心";
  fileName: string;
  content: string;
  expectTables?: boolean;
  expectImages?: boolean;
  expectMultiPage?: boolean;
  landscapeHint?: boolean;
};

function table(headers: string[], rows: string[][]): string {
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  return `| ${headers.join(" | ")} |\n${sep}\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}`;
}

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";

/** Build ≥100 durable PDF production cases. */
export function buildPdfProductionCases(): PdfProductionCase[] {
  const cases: PdfProductionCase[] = [];

  for (let i = 0; i < 12; i += 1) {
    cases.push({
      id: `report_${i}`,
      category: "報告書",
      fileName: `報告書_${i}`,
      content: `# 業務報告書 ${i + 1}

## 概要

本報告書は ${2026}年の業務進捗をまとめたものです。確認のうえ、保管してください。

## 実施内容

- 調査を実施しました
- 改善案をご用意しました
- 次週の予定を整理しました

## 数値

${table(
  ["項目", "値", "備考"],
  [
    ["進捗", `${60 + i}%`, "計画どおり"],
    ["件数", `${10 + i}`, "件"],
    ["金額", `${100000 + i * 1000}`, "円"],
  ],
)}
`,
      expectTables: true,
    });
  }

  for (let i = 0; i < 10; i += 1) {
    cases.push({
      id: `contract_${i}`,
      category: "契約書",
      fileName: `契約書_${i}`,
      content: `# 業務委託契約書

## 第1条（目的）

甲および乙は、本契約に基づき業務を遂行します。

## 第2条（契約期間）

契約期間は 2026-04-01 から 2027-03-31 までとします。

## 第3条（報酬）

${table(
  ["項目", "金額", "支払条件"],
  [
    ["着手金", "100000", "契約時"],
    ["完了金", `${200000 + i * 1000}`, "検収後"],
  ],
)}

## 第4条（秘密保持）

乙は業務上知り得た情報を第三者に漏洩してはなりません。
`,
      expectTables: true,
    });
  }

  for (let i = 0; i < 10; i += 1) {
    cases.push({
      id: `estimate_${i}`,
      category: "見積書",
      fileName: `見積書_${i}`,
      content: `# 見積書

## 宛先

株式会社サンプル 御中

## 明細

${table(
  ["品目", "数量", "単価", "金額"],
  Array.from({ length: 5 }, (_, r) => [
    `作業${r + 1}`,
    String(r + 1),
    String(10000 + i * 100),
    String((r + 1) * (10000 + i * 100)),
  ]),
)}

合計は税別表示です。
`,
      expectTables: true,
    });
  }

  for (let i = 0; i < 10; i += 1) {
    cases.push({
      id: `invoice_${i}`,
      category: "請求書",
      fileName: `請求書_${i}`,
      content: `# 請求書

請求日: 2026-08-${String(1 + (i % 28)).padStart(2, "0")}

## 請求明細

${table(
  ["内容", "数量", "単価", "金額"],
  [
    ["月額利用料", "1", "30000", "30000"],
    ["追加作業", String(i + 1), "5000", String((i + 1) * 5000)],
  ],
)}

振込期限を遵守してください。
`,
      expectTables: true,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    cases.push({
      id: `photo_report_${i}`,
      category: "写真付き報告書",
      fileName: `写真報告書_${i}`,
      content: `# 現場写真報告書

## 現場概要

現場番号 ${i + 1} の状況を報告します。

![現場写真${i + 1}](${TINY_PNG})

## 確認事項

- 安全対策を確認しました
- 是正が必要な箇所はありません

${table(["確認項目", "結果"], [["安全帯", "OK"], ["整理整頓", "OK"]])}
`,
      expectTables: true,
      expectImages: true,
    });
  }

  for (let i = 0; i < 10; i += 1) {
    cases.push({
      id: `spec_${i}`,
      category: "仕様書",
      fileName: `仕様書_${i}`,
      content: `# システム仕様書

## 範囲

本仕様書はモジュール ${i + 1} の要件を定義します。

## 機能一覧

${table(
  ["ID", "機能", "優先度", "状態"],
  Array.from({ length: 6 }, (_, r) => [
    `F-${i}-${r}`,
    `機能説明${r}`,
    r % 2 === 0 ? "高" : "中",
    "草案",
  ]),
)}

## 非機能要件

可用性・性能・セキュリティを満たすこと。
`,
      expectTables: true,
    });
  }

  for (let i = 0; i < 10; i += 1) {
    cases.push({
      id: `minutes_${i}`,
      category: "議事録",
      fileName: `議事録_${i}`,
      content: `# 会議議事録

## 基本情報

- 日時: 2026-07-${String(1 + i).padStart(2, "0")} 10:00
- 場所: 会議室A
- 参加者: 山田、佐藤、鈴木

## 議題

1. 進捗確認
2. 課題共有
3. 次アクション

## 決定事項

決定内容を記録し、関係者へ共有します。
`,
    });
  }

  for (let i = 0; i < 8; i += 1) {
    cases.push({
      id: `manual_${i}`,
      category: "マニュアル",
      fileName: `マニュアル_${i}`,
      content: `# 操作マニュアル

## はじめに

本マニュアルは日常業務の手順を説明します。

## 手順

1. ログインします
2. 案件を選択します
3. 成果物を確認します
4. 必要なら修正依頼を出します

## 注意事項

「保存」を押す前に内容を確認してください。全角・半角の混在に注意します。
`,
    });
  }

  cases.push({
    id: "long_doc",
    category: "長文",
    fileName: "長文PDF",
    content: `# 長文報告書

${Array.from({ length: 40 }, (_, i) => `## 節 ${i + 1}\n\nこれは長文の段落です。企業向けに提出・印刷・保管できる品質を確認します。句読点、禁則処理、改行位置を検証します。\n\n- 項目A-${i}\n- 項目B-${i}\n`).join("\n")}`,
    expectMultiPage: true,
  });

  cases.push({
    id: "table_heavy",
    category: "表中心",
    fileName: "表中心PDF",
    content: `# 表中心資料

## 広域表

${table(
  ["列1", "列2", "列3", "列4", "列5", "列6", "列7", "列8"],
  Array.from({ length: 12 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => `R${r}C${c}`),
  ),
)}

## 明細

${table(
  ["品目", "説明", "数量", "金額"],
  Array.from({ length: 15 }, (_, r) => [
    `品目${r}`,
    `長い説明文を含むセルです。折り返しとページ跨ぎを確認します。`.repeat(2),
    String(r + 1),
    String(1000 * (r + 1)),
  ]),
)}
`,
    expectTables: true,
    expectMultiPage: true,
    landscapeHint: true,
  });

  let pad = 0;
  while (cases.length < 100) {
    cases.push({
      id: `pad_report_${pad}`,
      category: "報告書",
      fileName: `報告書追加_${pad}`,
      content: `# 追加報告書 ${pad}

## 内容

追加ケース ${pad} の本文です。印刷品質を確認します。

${table(["No", "内容"], [["1", `メモ${pad}`], ["2", `確認${pad}`]])}
`,
      expectTables: true,
    });
    pad += 1;
  }

  return cases;
}
