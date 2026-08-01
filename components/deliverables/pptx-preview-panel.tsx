"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import type { PptxPreviewPayload } from "@/lib/pptx-secretary/types";

type Props = {
  deliverableId: string;
  fileName?: string;
  onReedit?: () => void;
};

export function PptxPreviewPanel({ deliverableId, fileName, onReedit }: Props) {
  const [preview, setPreview] = useState<PptxPreviewPayload | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/pptx/preview?deliverableId=${encodeURIComponent(deliverableId)}`,
      );
      const body = (await response.json()) as {
        ok?: boolean;
        preview?: PptxPreviewPayload;
        error?: string;
      };
      if (!response.ok || !body.preview) {
        setError(body.error || "プレビューの取得に失敗しました");
        setPreview(null);
        return;
      }
      setPreview(body.preview);
      setIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "プレビューに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [deliverableId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">スライドを読み込み中…</p>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="プレビューを表示できません"
        message={`${error} ダウンロードは引き続き利用できます。`}
      />
    );
  }

  if (!preview?.slides.length) {
    return <p className="text-sm text-muted-foreground">スライドがありません</p>;
  }

  const slide = preview.slides[index] ?? preview.slides[0]!;
  const visibleThumbs = preview.slides.slice(0, 12);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">{preview.title}</p>
          <p className="text-xs text-muted-foreground">
            {preview.slideCount}枚 · {preview.aspectRatio} · {preview.themeId}
            {fileName ? ` · ${fileName}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setShowNotes((v) => !v)}
          >
            {showNotes ? "ノートを隠す" : "発表ノート"}
          </Button>
          {onReedit ? (
            <Button type="button" size="sm" onClick={onReedit}>
              再編集
            </Button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2 pb-1">
          {visibleThumbs.map((item, thumbIndex) => (
            <button
              key={item.slideNumber}
              type="button"
              onClick={() => setIndex(thumbIndex)}
              className={`w-28 rounded-lg border px-2 py-2 text-left text-xs ${
                thumbIndex === index
                  ? "border-foreground bg-foreground text-background"
                  : "border-[var(--border-subtle)] bg-[var(--background-muted)]/40"
              }`}
            >
              <p className="font-medium">{item.slideNumber}. {item.title}</p>
            </button>
          ))}
          {preview.slides.length > 12 ? (
            <span className="self-center text-xs text-muted-foreground">
              +{preview.slides.length - 12}枚
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--background-muted)]/30 p-4">
        <p className="text-lg font-semibold text-foreground">{slide.title}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {slide.previewText || "（本文なし）"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {slide.hasChart ? <span>グラフあり</span> : null}
          {slide.hasVisual ? <span>図解あり</span> : null}
          {slide.hasNotes ? <span>ノートあり</span> : null}
          <span>約{slide.estimatedSeconds}秒</span>
        </div>
        {showNotes ? (
          <p className="mt-3 rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-2 text-sm">
            発表ノートは原本.pptx内に保存されています。ダウンロードしてPowerPointのノート表示で確認できます。
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={index <= 0}
          onClick={() => setIndex((v) => Math.max(0, v - 1))}
        >
          前へ
        </Button>
        <span className="text-sm text-muted-foreground">
          {index + 1} / {preview.slides.length}
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={index >= preview.slides.length - 1}
          onClick={() =>
            setIndex((v) => Math.min(preview.slides.length - 1, v + 1))
          }
        >
          次へ
        </Button>
      </div>

      {preview.warnings.length ? (
        <ul className="text-xs text-muted-foreground">
          {preview.warnings.slice(0, 3).map((w) => (
            <li key={w}>・{w}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">{preview.scaleGuidance}</p>
    </div>
  );
}
