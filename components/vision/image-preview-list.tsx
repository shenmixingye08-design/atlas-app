"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/design-system/cn";

export type ImagePreviewItem = {
  id: string;
  previewUrl: string;
  fileName: string;
  sizeLabel: string;
  status: "pending" | "uploading" | "uploaded" | "failed";
  progress: number;
  error?: string;
  developerCode?: string;
  diagnosticId?: string;
};

type ImagePreviewListProps = {
  items: ImagePreviewItem[];
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
};

export function ImagePreviewList({
  items,
  onRemove,
  onRetry,
}: ImagePreviewListProps) {
  if (items.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((item) => (
        <li
          key={item.id}
          className="overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]"
        >
          <div className="relative aspect-square bg-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.previewUrl}
              alt={item.fileName}
              className="h-full w-full object-cover"
            />
            {item.status === "uploading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-xs text-white">
                アップロード中 {item.progress}%
              </div>
            )}
            {item.status === "failed" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45 px-2 text-center text-xs text-white">
                失敗
              </div>
            )}
          </div>
          <div className="space-y-1 p-2">
            <p className="truncate text-xs text-foreground">{item.fileName}</p>
            <p className="text-[11px] text-[var(--text-secondary)]">{item.sizeLabel}</p>
            {item.error && (
              <p className="text-[11px] text-red-600">{item.error}</p>
            )}
            {(item.developerCode || item.diagnosticId) && (
              <div className="flex flex-wrap items-center gap-1">
                <p className="break-all text-[10px] text-[var(--text-secondary)]">
                  {[item.developerCode, item.diagnosticId]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
                {item.diagnosticId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1 text-[10px]"
                    onClick={() => {
                      void navigator.clipboard?.writeText(
                        [
                          item.developerCode,
                          item.diagnosticId,
                          item.error,
                        ]
                          .filter(Boolean)
                          .join(" "),
                      );
                    }}
                  >
                    詳細をコピー
                  </Button>
                )}
              </div>
            )}
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => onRemove(item.id)}
              >
                削除
              </Button>
              {item.status === "failed" && onRetry && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className={cn("h-7 px-2 text-xs")}
                  onClick={() => onRetry(item.id)}
                >
                  再試行
                </Button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
