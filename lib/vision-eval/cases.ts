import type { VisionEvalCase, VisionEvalCategory } from "@/lib/vision-eval/types";
import type { VisionDetectedType } from "@/lib/vision/types";

/** Fictional JP shop/company names — not real entities / no personal data. */
const SHOPS = [
  "青葉商店",
  "みなとベーカリー",
  "星空カフェ",
  "楠木書店",
  "ひまわり薬局",
  "北風雑貨",
  "桜橋チケット",
  "銀杏クリーニング",
  "虹色文具",
  "つばめ食堂",
  "楓マーケット",
  "白波水産",
  "こころ花屋",
  "雷門テック",
  "若葉文具堂",
];

const COMPANIES = [
  "株式会社ミネルボ検証",
  "合同会社アトラス模擬",
  "有限会社サンプル商事",
  "株式会社架空ロジスティクス",
  "株式会社テスト製作所",
  "合同会社デモ会計",
  "株式会社検証デザイン",
  "有限会社モック印刷",
  "株式会社フィクスチャ建設",
  "合同会社ダミー運輸",
];

const PEOPLE = [
  "山田 太郎",
  "佐藤 花子",
  "鈴木 一郎",
  "高橋 美咲",
  "伊藤 健",
  "渡辺 結衣",
  "中村 翔",
  "小林 葵",
  "加藤 蓮",
  "吉田 凛",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function dateFor(i: number): string {
  const month = (i % 12) + 1;
  const day = (i % 27) + 1;
  return `2026-${pad2(month)}-${pad2(day)}`;
}

function amountFor(i: number, base: number): string {
  return yen(base + i * 137);
}

function caseImageName(caseId: string): string {
  return `images/${caseId}.png`;
}

function buildReceipt(i: number): VisionEvalCase {
  const caseId = `vr_receipt_${pad2(i + 1)}`;
  const shop = SHOPS[i % SHOPS.length]!;
  const date = dateFor(i + 3);
  const total = amountFor(i, 1280);
  const item = `検証商品${pad2(i + 1)}`;
  return {
    caseId,
    category: "receipt",
    imagePath: caseImageName(caseId),
    expectedDocumentType: "receipt",
    expectedFields: {
      storeName: shop,
      date,
      total,
      item,
    },
    expectedReadable: [shop, date, total.replace("¥", ""), item],
    difficulty: i < 10 ? "easy" : "medium",
    notes: "合成レシート。実店舗・実個人情報なし",
    seed: {
      title: "領収証 / レシート",
      company: shop,
      date,
      amount: total,
      lines: [
        shop,
        `日付 ${date}`,
        `${item} 1点`,
        `合計 ${total}`,
        "（税込）",
        `レシートNo R-${1000 + i}`,
      ],
    },
  };
}

function buildInvoice(i: number): VisionEvalCase {
  const caseId = `vr_invoice_${pad2(i + 1)}`;
  const company = COMPANIES[i % COMPANIES.length]!;
  const date = dateFor(i + 7);
  const total = amountFor(i, 55000);
  const invNo = `INV-2026-${pad2(i + 1)}`;
  return {
    caseId,
    category: "invoice",
    imagePath: caseImageName(caseId),
    expectedDocumentType: "invoice",
    expectedFields: {
      companyName: company,
      date,
      total,
      invoiceNumber: invNo,
    },
    expectedReadable: [company, date, total.replace("¥", ""), invNo],
    difficulty: "medium",
    notes: "合成請求書",
    seed: {
      title: "請求書",
      company,
      date,
      amount: total,
      lines: [
        company,
        `請求書番号 ${invNo}`,
        `請求日 ${date}`,
        "品目: 検証業務委託費",
        `ご請求金額 ${total}`,
        "振込期限: 月末",
      ],
    },
  };
}

function buildRyoshusho(i: number): VisionEvalCase {
  const caseId = `vr_ryoshu_${pad2(i + 1)}`;
  const company = COMPANIES[(i + 3) % COMPANIES.length]!;
  const date = dateFor(i + 11);
  const total = amountFor(i, 3000);
  return {
    caseId,
    category: "ryoshusho",
    imagePath: caseImageName(caseId),
    expectedDocumentType: "receipt",
    expectedFields: {
      companyName: company,
      date,
      total,
    },
    expectedReadable: ["領収書", company, date, total.replace("¥", "")],
    difficulty: "easy",
    notes: "合成領収書（receipt 型として評価）",
    seed: {
      title: "領 収 書",
      company,
      date,
      amount: total,
      lines: [
        "領収書",
        `${company} 御中`,
        `金額 ${total}`,
        `但し 検証用品代として`,
        `日付 ${date}`,
        "上記正に領収いたしました",
      ],
    },
  };
}

function buildTable(i: number): VisionEvalCase {
  const caseId = `vr_table_${pad2(i + 1)}`;
  const a = 10 + i;
  const b = 20 + i * 2;
  const c = a + b;
  return {
    caseId,
    category: "table_form",
    imagePath: caseImageName(caseId),
    expectedDocumentType: "table",
    expectedFields: {
      row1: `品目A ${a}`,
      row2: `品目B ${b}`,
      total: String(c),
    },
    expectedReadable: ["品目", "数量", String(a), String(b), String(c)],
    difficulty: "medium",
    notes: "合成表・帳票",
    seed: {
      title: "月次集計表",
      lines: [
        "項目 | 数量 | 金額",
        `品目A | ${a} | ${yen(a * 100)}`,
        `品目B | ${b} | ${yen(b * 100)}`,
        `合計 | ${a + b} | ${yen(c * 100)}`,
        `表ID T-${pad2(i + 1)}`,
      ],
    },
  };
}

function buildCard(i: number): VisionEvalCase {
  const caseId = `vr_card_${pad2(i + 1)}`;
  const person = PEOPLE[i % PEOPLE.length]!;
  const company = COMPANIES[i % COMPANIES.length]!;
  const phone = `03-${pad2(1000 + i).slice(-4)}-${pad2(2000 + i).slice(-4)}`;
  const email = `demo${pad2(i + 1)}@example.minervot.test`;
  return {
    caseId,
    category: "business_card",
    imagePath: caseImageName(caseId),
    expectedDocumentType: "business_card",
    expectedFields: {
      name: person,
      companyName: company,
      phone,
      email,
    },
    expectedReadable: [person, company, phone, email],
    difficulty: "easy",
    notes: "合成名刺（example ドメイン）",
    seed: {
      title: "名刺",
      company,
      lines: [company, person, "営業部", `TEL ${phone}`, email],
    },
  };
}

function buildNote(i: number): VisionEvalCase {
  const caseId = `vr_note_${pad2(i + 1)}`;
  const task = `検証タスク${pad2(i + 1)}を完了する`;
  const date = dateFor(i + 2);
  return {
    caseId,
    category: "handwritten_note",
    imagePath: caseImageName(caseId),
    expectedDocumentType: "handwritten_note",
    expectedFields: {
      note: task,
      date,
    },
    expectedReadable: [task, date, "メモ"],
    difficulty: "hard",
    notes: "手書き風フォントの合成メモ（実筆跡ではない）",
    seed: {
      title: "手書きメモ",
      date,
      lines: ["メモ", date, task, "優先: 高", `N-${pad2(i + 1)}`],
    },
  };
}

function buildScreenshot(i: number): VisionEvalCase {
  const caseId = `vr_shot_${pad2(i + 1)}`;
  const title = `設定画面サンプル ${pad2(i + 1)}`;
  const status = i % 2 === 0 ? "保存済み" : "未保存";
  return {
    caseId,
    category: "screenshot",
    imagePath: caseImageName(caseId),
    expectedDocumentType: "screenshot",
    expectedFields: {
      screenTitle: title,
      status,
    },
    expectedReadable: [title, status, "MINERVOT"],
    difficulty: "easy",
    notes: "UIスクリーンショット風合成",
    seed: {
      title,
      lines: [
        "MINERVOT Console",
        title,
        `状態: ${status}`,
        "ボタン: 保存 / キャンセル",
        `Build #${2000 + i}`,
      ],
    },
  };
}

function buildChart(i: number): VisionEvalCase {
  const caseId = `vr_chart_${pad2(i + 1)}`;
  const v1 = 30 + i * 5;
  const v2 = 50 + i * 3;
  return {
    caseId,
    category: "chart",
    imagePath: caseImageName(caseId),
    expectedDocumentType: "chart",
    expectedFields: {
      seriesA: String(v1),
      seriesB: String(v2),
    },
    expectedReadable: ["売上", String(v1), String(v2), "グラフ"],
    difficulty: "medium",
    notes: "棒グラフ合成",
    seed: {
      title: "月次売上グラフ",
      lines: [
        "グラフ: 月次売上",
        `シリーズA ${v1}`,
        `シリーズB ${v2}`,
        `チャートID C-${pad2(i + 1)}`,
      ],
    },
  };
}

function buildVariant(
  category: VisionEvalCategory,
  i: number,
  base: VisionEvalCase,
  difficulty: VisionEvalCase["difficulty"],
  note: string
): VisionEvalCase {
  const caseId = `vr_${category}_${pad2(i + 1)}`;
  return {
    ...base,
    caseId,
    category,
    imagePath: caseImageName(caseId),
    difficulty,
    notes: note,
  };
}

/**
 * 100 unique synthetic Vision evaluation cases.
 * Counts: receipt15, invoice10, ryoshusho10, table15, card10, note10,
 * screenshot10, chart5, dark5, tilted5, blurred5.
 */
export function buildVisionEvalCases(): VisionEvalCase[] {
  const cases: VisionEvalCase[] = [];
  for (let i = 0; i < 15; i++) cases.push(buildReceipt(i));
  for (let i = 0; i < 10; i++) cases.push(buildInvoice(i));
  for (let i = 0; i < 10; i++) cases.push(buildRyoshusho(i));
  for (let i = 0; i < 15; i++) cases.push(buildTable(i));
  for (let i = 0; i < 10; i++) cases.push(buildCard(i));
  for (let i = 0; i < 10; i++) cases.push(buildNote(i));
  for (let i = 0; i < 10; i++) cases.push(buildScreenshot(i));
  for (let i = 0; i < 5; i++) cases.push(buildChart(i));

  // dark / tilted / blurred — unique content derived from receipt/invoice seeds
  for (let i = 0; i < 5; i++) {
    const base = buildReceipt(20 + i);
    cases.push(
      buildVariant("dark", i, base, "hard", "暗い合成画像（輝度低下）。水増し複製ではない固有金額・日付")
    );
  }
  for (let i = 0; i < 5; i++) {
    const base = buildInvoice(20 + i);
    cases.push(
      buildVariant("tilted", i, base, "hard", "傾けた合成画像。固有請求番号")
    );
  }
  for (let i = 0; i < 5; i++) {
    const base = buildTable(20 + i);
    cases.push(
      buildVariant("blurred", i, base, "hard", "ぼかし合成画像。固有表データ")
    );
  }

  return cases;
}

export const VISION_EVAL_CASES: VisionEvalCase[] = buildVisionEvalCases();

export function assertVisionEvalCaseCounts(cases: VisionEvalCase[] = VISION_EVAL_CASES): void {
  const count = (c: VisionEvalCategory) => cases.filter((x) => x.category === c).length;
  if (cases.length < 100) throw new Error(`expected >=100 cases, got ${cases.length}`);
  if (count("receipt") < 15) throw new Error("receipt < 15");
  if (count("invoice") < 10) throw new Error("invoice < 10");
  if (count("ryoshusho") < 10) throw new Error("ryoshusho < 10");
  if (count("table_form") < 15) throw new Error("table_form < 15");
  if (count("business_card") < 10) throw new Error("business_card < 10");
  if (count("handwritten_note") < 10) throw new Error("handwritten_note < 10");
  if (count("screenshot") < 10) throw new Error("screenshot < 10");
  if (count("chart") < 5) throw new Error("chart < 5");
  if (count("dark") < 5) throw new Error("dark < 5");
  if (count("tilted") < 5) throw new Error("tilted < 5");
  if (count("blurred") < 5) throw new Error("blurred < 5");
  const ids = new Set(cases.map((c) => c.caseId));
  if (ids.size !== cases.length) throw new Error("duplicate caseId");
}

export function hintTypeForCase(c: VisionEvalCase): VisionDetectedType {
  return c.expectedDocumentType;
}
