/**
 * First-value Quick Start presets — empty home CTAs.
 * No new AI capability; seeds existing Automation / Workspace paths.
 */

export type QuickStartFrequency = "once" | "daily" | "weekly";

export type QuickStartPreset = {
  id:
    | "sales_material"
    | "email"
    | "receipt"
    | "minutes"
    | "invoice"
    | "vision";
  label: string;
  title: string;
  workContent: string;
  createHref: string;
  defaultFrequency: QuickStartFrequency;
};

export const QUICK_START_PRESETS: readonly QuickStartPreset[] = [
  {
    id: "sales_material",
    label: "営業資料を作る",
    title: "営業資料の作成",
    workContent:
      "営業資料を作成してください。目的・課題・提案・効果・次のアクションが伝わる構成にし、WordまたはPowerPointでご用意ください。",
    createHref: "/automations/new",
    defaultFrequency: "weekly",
  },
  {
    id: "email",
    label: "メールを書く",
    title: "営業・フォローメール作成",
    workContent:
      "見込み顧客向けのメール文を作成してください。件名案と本文を用意し、相手の課題に寄り添いつつ次の一歩を促してください。",
    createHref: "/automations/new",
    defaultFrequency: "daily",
  },
  {
    id: "receipt",
    label: "レシート整理",
    title: "レシート整理",
    workContent:
      "レシートや領収書の画像を解析し、日付・店舗・金額・科目を表に整理してください。Excelでご用意ください。",
    createHref: "/automations/new",
    defaultFrequency: "weekly",
  },
  {
    id: "minutes",
    label: "議事録作成",
    title: "議事録作成",
    workContent:
      "会議の議事録を作成してください。出席者・議題・決定事項・アクションアイテム（担当と期限）を整理し、Wordでご用意ください。",
    createHref: "/automations/new",
    defaultFrequency: "once",
  },
  {
    id: "invoice",
    label: "請求書整理",
    title: "請求書整理",
    workContent:
      "請求書の内容を整理してください。請求元・金額・期日・支払状況が分かる表をExcelでご用意ください。",
    createHref: "/automations/new",
    defaultFrequency: "weekly",
  },
  {
    id: "vision",
    label: "画像解析",
    title: "画像・書類の解析",
    workContent:
      "アップロードした画像や書類を解析し、要点・抽出テキスト・次に取るべき作業をまとめてください。",
    createHref: "/automations/new",
    defaultFrequency: "once",
  },
] as const;

export function getQuickStartPreset(
  id: string | null | undefined,
): QuickStartPreset | null {
  if (!id) return null;
  return QUICK_START_PRESETS.find((item) => item.id === id) ?? null;
}

export function buildQuickStartCreateHref(
  preset: QuickStartPreset,
  overrides?: {
    title?: string;
    frequency?: QuickStartFrequency;
    workContent?: string;
  },
): string {
  const params = new URLSearchParams({
    seed: overrides?.workContent ?? preset.workContent,
    title: overrides?.title ?? preset.title,
    frequency: overrides?.frequency ?? preset.defaultFrequency,
    quickStart: preset.id,
  });
  return `${preset.createHref}?${params.toString()}`;
}

export function buildQuickStartTryNowHref(preset: QuickStartPreset): string {
  const params = new URLSearchParams({
    assignment: preset.workContent,
    autostart: "1",
    quickStart: preset.id,
  });
  return `/workspace?${params.toString()}`;
}

export const FREQUENCY_OPTIONS: ReadonlyArray<{
  id: QuickStartFrequency;
  label: string;
}> = [
  { id: "once", label: "一度だけ" },
  { id: "daily", label: "毎日" },
  { id: "weekly", label: "毎週" },
];
