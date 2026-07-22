import type { DeliverableFormat } from "@/lib/deliverables/types";

import type { SalesFormatPreset } from "./types";

export type SalesFormatOption = {
  id: SalesFormatPreset;
  label: string;
  description: string;
  formats: DeliverableFormat[];
  generatesFiles: boolean;
};

export const SALES_FORMAT_OPTIONS: readonly SalesFormatOption[] = [
  {
    id: "pptx",
    label: "PowerPoint",
    description: "編集しやすいスライド形式",
    formats: ["pptx"],
    generatesFiles: true,
  },
  {
    id: "pdf",
    label: "PDF",
    description: "共有・印刷向け",
    formats: ["pdf"],
    generatesFiles: true,
  },
  {
    id: "docx",
    label: "Word",
    description: "文章中心の資料",
    formats: ["docx"],
    generatesFiles: true,
  },
  {
    id: "md",
    label: "Markdown",
    description: "軽量テキスト（低コスト）",
    formats: ["md"],
    generatesFiles: true,
  },
  {
    id: "txt",
    label: "テキストのみ",
    description: "ファイル生成なし・プレビューのみ",
    formats: [],
    generatesFiles: false,
  },
  {
    id: "pptx_pdf",
    label: "PowerPoint＋PDF",
    description: "編集用＋配布用",
    formats: ["pptx", "pdf"],
    generatesFiles: true,
  },
  {
    id: "docx_pdf",
    label: "Word＋PDF",
    description: "編集用＋配布用",
    formats: ["docx", "pdf"],
    generatesFiles: true,
  },
  {
    id: "xlsx",
    label: "Excel",
    description: "表・数値管理向け",
    formats: ["xlsx", "csv"],
    generatesFiles: true,
  },
  {
    id: "all",
    label: "すべて作成",
    description: "全形式（時間・コスト大）",
    formats: ["pptx", "pdf", "docx", "xlsx", "md", "txt", "csv"],
    generatesFiles: true,
  },
] as const;

export function getSalesFormatOption(
  preset: SalesFormatPreset,
): SalesFormatOption {
  return (
    SALES_FORMAT_OPTIONS.find((option) => option.id === preset) ??
    SALES_FORMAT_OPTIONS[0]
  );
}

export function presetToFormats(preset: SalesFormatPreset): DeliverableFormat[] {
  return [...getSalesFormatOption(preset).formats];
}

export function presetGeneratesFiles(preset: SalesFormatPreset): boolean {
  return getSalesFormatOption(preset).generatesFiles;
}

export function formatPresetLabel(preset: SalesFormatPreset): string {
  return getSalesFormatOption(preset).label;
}
