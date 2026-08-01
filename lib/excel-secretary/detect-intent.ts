import type { ExcelWorkbookKind } from "./types";

export type ExcelIntent = {
  kind: ExcelWorkbookKind;
  title: string;
  wantsChart: boolean;
  wantsGantt: boolean;
  wantsAnalysis: boolean;
};

/**
 * Rule-based NL intent — no AI. AI fills content later when needed.
 */
export function detectExcelIntent(assignment: string): ExcelIntent {
  const text = assignment.trim();
  const wantsChart = /グラフ|チャート|可視化|円グラフ|棒グラフ|折れ線/i.test(text);
  const wantsAnalysis = /分析|異常|ランキング|前年|比較|インサイト/i.test(text);
  const wantsGantt = /ガント|工程表|WBS|スケジュール管理/i.test(text);

  if (/家計簿|家計|経費精算|レシート/.test(text)) {
    return { kind: "household", title: "家計簿", wantsChart: true, wantsGantt: false, wantsAnalysis };
  }
  if (/請求書/.test(text)) {
    return { kind: "invoice", title: "請求書", wantsChart, wantsGantt: false, wantsAnalysis };
  }
  if (/見積/.test(text)) {
    return { kind: "estimate", title: "見積書", wantsChart, wantsGantt: false, wantsAnalysis };
  }
  if (/領収/.test(text)) {
    return { kind: "receipt", title: "領収書台帳", wantsChart, wantsGantt: false, wantsAnalysis };
  }
  if (/在庫/.test(text)) {
    return { kind: "inventory", title: "在庫管理表", wantsChart, wantsGantt: false, wantsAnalysis };
  }
  if (/顧客|取引先|名簿|CRM/i.test(text)) {
    return { kind: "customers", title: "顧客管理表", wantsChart: false, wantsGantt: false, wantsAnalysis };
  }
  if (/勤務表|シフト/.test(text)) {
    return { kind: "attendance", title: "勤務表", wantsChart: false, wantsGantt: false, wantsAnalysis };
  }
  if (/勤怠|タイムカード|出退勤/.test(text)) {
    return { kind: "timecard", title: "勤怠管理", wantsChart, wantsGantt: false, wantsAnalysis };
  }
  if (wantsGantt || /工程/.test(text)) {
    return { kind: "gantt", title: "工程表（ガント）", wantsChart: false, wantsGantt: true, wantsAnalysis };
  }
  if (/スケジュール|予定表|日程/.test(text)) {
    return { kind: "schedule", title: "スケジュール表", wantsChart: false, wantsGantt: false, wantsAnalysis };
  }
  if (/売上|販売管理|売上管理/.test(text)) {
    return { kind: "sales", title: "売上管理表", wantsChart: true, wantsGantt: false, wantsAnalysis };
  }
  if (/アンケート/.test(text)) {
    return { kind: "generic_table", title: "アンケート集計", wantsChart: true, wantsGantt: false, wantsAnalysis };
  }
  return {
    kind: "generic_table",
    title: "業務表",
    wantsChart,
    wantsGantt: false,
    wantsAnalysis,
  };
}
