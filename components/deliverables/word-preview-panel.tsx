"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";

type WordPreviewBlock =
  | { type: "paragraph"; text: string }
  | { type: "bulletList"; items: string[] }
  | { type: "numberedList"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "notice"; variant?: "note" | "important" | "warning"; text: string }
  | { type: "quote"; text: string }
  | { type: "keyValue"; pairs: Array<{ label: string; value: string }> }
  | { type: "signature"; lines: string[] }
  | { type: "imagePlaceholder"; caption: string }
  | { type: "pageBreak" };

type WordPreviewModel = {
  title: string;
  subtitle?: string;
  templateId: string;
  templateName: string;
  createdAt?: string;
  author?: string;
  companyName?: string;
  recipient?: string;
  sections: Array<{
    id: string;
    level: number;
    title: string;
    blocks: WordPreviewBlock[];
  }>;
  estimatedPages: number;
  sizeBytes?: number;
  version?: number;
  isLatest?: boolean;
  status: "ready" | "generating" | "failed";
};

type PreviewResponse = {
  preview?: WordPreviewModel;
  error?: string;
};

type WordPreviewPanelProps = {
  deliverableId: string;
};

function formatBytes(value: number | undefined): string {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function statusLabel(status: WordPreviewModel["status"], isLatest?: boolean): string {
  if (status === "generating") return "生成中";
  if (status === "failed") return "確認が必要";
  return isLatest === false ? "旧版" : "最新";
}

function SectionHeading({
  level,
  children,
}: {
  level: number;
  children: ReactNode;
}) {
  if (level <= 1) {
    return <h2 className="text-xl font-semibold text-foreground">{children}</h2>;
  }
  if (level === 2) {
    return <h3 className="text-lg font-semibold text-foreground">{children}</h3>;
  }
  return <h4 className="text-base font-semibold text-foreground">{children}</h4>;
}

function PreviewTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
      <table className="min-w-full divide-y divide-[var(--border-subtle)] text-left text-sm">
        {headers.length > 0 ? (
          <thead className="bg-[var(--surface-muted)]">
            <tr>
              {headers.map((header, index) => (
                <th
                  key={`${header}-${index + 1}`}
                  scope="col"
                  className="px-3 py-2 font-semibold text-foreground"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--card)]">
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex + 1}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`cell-${rowIndex + 1}-${cellIndex + 1}`}
                  className="px-3 py-2 align-top text-[var(--foreground-muted)]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewBlock({ block }: { block: WordPreviewBlock }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {block.text}
        </p>
      );
    case "bulletList":
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {block.items.map((item, index) => (
            <li key={`${item}-${index + 1}`}>{item}</li>
          ))}
        </ul>
      );
    case "numberedList":
      return (
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          {block.items.map((item, index) => (
            <li key={`${item}-${index + 1}`}>{item}</li>
          ))}
        </ol>
      );
    case "table":
      return <PreviewTable headers={block.headers} rows={block.rows} />;
    case "notice":
      return (
        <p className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-4 py-3 text-sm leading-relaxed">
          <span className="font-medium">
            {block.variant === "warning"
              ? "注意: "
              : block.variant === "important"
                ? "重要: "
                : "メモ: "}
          </span>
          {block.text}
        </p>
      );
    case "quote":
      return (
        <blockquote className="border-l-4 border-[var(--border-strong)] pl-4 text-sm leading-relaxed text-[var(--foreground-muted)]">
          {block.text}
        </blockquote>
      );
    case "keyValue":
      return (
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          {block.pairs.map((pair, index) => (
            <div
              key={`${pair.label}-${index + 1}`}
              className="contents"
            >
              <dt className="font-medium text-foreground">{pair.label}</dt>
              <dd className="text-[var(--foreground-muted)]">{pair.value}</dd>
            </div>
          ))}
        </dl>
      );
    case "signature":
      return (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {block.lines.join("\n")}
        </div>
      );
    case "imagePlaceholder":
      return (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--foreground-muted)]">
          画像: {block.caption}
        </p>
      );
    case "pageBreak":
      return (
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
          改ページ
        </p>
      );
    default:
      return null;
  }
}

export function WordPreviewPanel({ deliverableId }: WordPreviewPanelProps) {
  const [preview, setPreview] = useState<WordPreviewModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/deliverables/${encodeURIComponent(deliverableId)}/preview`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => ({}))) as PreviewResponse;
      if (!response.ok || !body.preview) {
        throw new Error(body.error ?? "プレビューを読み込めませんでした。");
      }
      setPreview(body.preview);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "プレビューを読み込めませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }, [deliverableId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPreview();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPreview]);

  return (
    <Card
      padding="md"
      className="space-y-5 bg-[var(--background-subtle)]/70 shadow-none"
      aria-label="Wordプレビュー"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Wordプレビュー</h3>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Wordファイルの構成を画面上で確認できます。
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 touch-manipulation"
          disabled={busy}
          aria-label="Wordプレビューを再読み込み"
          onClick={() => void loadPreview()}
        >
          {busy ? "読み込み中" : "再読み込み"}
        </Button>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error ? <ErrorState message={error} /> : null}
      </div>

      {preview ? (
        <article className="space-y-6" aria-label={`${preview.title}のプレビュー`}>
          <header className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs text-[var(--foreground-muted)]">
              <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1">
                テンプレート: {preview.templateName}
              </span>
              <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1">
                状態: {statusLabel(preview.status, preview.isLatest)}
              </span>
              <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1">
                版: {preview.version ? `v${preview.version}` : "—"}
              </span>
            </div>
            <div>
              <h2 className="break-words text-2xl font-semibold tracking-tight text-foreground">
                {preview.title}
              </h2>
              {preview.subtitle ? (
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  {preview.subtitle}
                </p>
              ) : null}
            </div>
            <dl className="grid gap-2 text-sm text-[var(--foreground-muted)] sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground">作成日</dt>
                <dd>{formatDate(preview.createdAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">想定ページ数</dt>
                <dd>{preview.estimatedPages}ページ</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">サイズ</dt>
                <dd>{formatBytes(preview.sizeBytes)}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">宛先</dt>
                <dd>{preview.recipient ?? "—"}</dd>
              </div>
            </dl>
          </header>

          <div className="space-y-5">
            {preview.sections.map((section) => (
              <section
                key={section.id}
                className="space-y-3 rounded-[var(--radius-xl)] bg-[var(--card)] px-4 py-4"
              >
                <SectionHeading level={section.level}>{section.title}</SectionHeading>
                <div className="space-y-3 text-foreground">
                  {section.blocks.map((block, index) => (
                    <PreviewBlock key={`${section.id}-${index + 1}`} block={block} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      ) : (
        <p
          className="text-sm text-[var(--foreground-muted)]"
          role="status"
          aria-live="polite"
        >
          {busy ? "プレビューを読み込んでいます。" : "プレビューは未読み込みです。"}
        </p>
      )}
    </Card>
  );
}
