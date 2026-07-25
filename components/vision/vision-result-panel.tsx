"use client";

import { Button } from "@/components/ui/button";

export type VisionResultSummary = {
  label?: string | null;
  summary?: string | null;
  detectedType?: string | null;
  warnings?: string[];
  imageCount?: number;
  onChangeType?: () => void;
};

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "receipt", label: "レシート" },
  { value: "invoice", label: "請求書" },
  { value: "sales_material", label: "営業資料" },
  { value: "table", label: "表" },
  { value: "handwritten_note", label: "手書きメモ" },
  { value: "business_card", label: "名刺" },
  { value: "general_photo", label: "一般写真" },
];

type VisionResultPanelProps = {
  result: VisionResultSummary;
  selectedType?: string;
  onSelectedTypeChange?: (value: string) => void;
};

export function VisionResultPanel({
  result,
  selectedType,
  onSelectedTypeChange,
}: VisionResultPanelProps) {
  if (!result.summary && !result.label) return null;

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] p-3">
      {result.label && (
        <p className="text-sm font-medium text-foreground">{result.label}</p>
      )}
      {result.summary && (
        <p className="text-sm text-[var(--text-secondary)]">{result.summary}</p>
      )}
      {typeof result.imageCount === "number" && result.imageCount > 1 && (
        <p className="text-xs text-[var(--text-secondary)]">
          {result.imageCount}枚の画像を解析しました
        </p>
      )}
      {result.warnings && result.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700">
          {result.warnings.slice(0, 5).map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {onSelectedTypeChange && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <label className="text-xs text-[var(--text-secondary)]">
            種類を変更
            <select
              className="ml-2 rounded border border-[var(--border-subtle)] bg-transparent px-2 py-1 text-xs"
              value={selectedType ?? result.detectedType ?? "unknown"}
              onChange={(event) => onSelectedTypeChange(event.target.value)}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {result.onChangeType && (
            <Button type="button" size="sm" variant="ghost" onClick={result.onChangeType}>
              再解析
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
