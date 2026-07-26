"use client";

import { useMemo } from "react";

import { buildArtifactPreview } from "@/lib/artifact-engine/build-preview";
import type { OrgAssistProfile } from "@/lib/artifact-engine/org-assist-store";
import type { ArtifactTemplateId } from "@/lib/artifact-engine/templates/types";
import type { ArtifactPreviewBlock } from "@/lib/artifact-engine/types";

type ArtifactDocumentPreviewProps = {
  assignment: string;
  content: string;
  title?: string;
  templateOverride?: ArtifactTemplateId;
  orgProfile?: OrgAssistProfile | null;
};

function PreviewBlock({ block }: { block: ArtifactPreviewBlock }) {
  switch (block.type) {
    case "paragraph":
      return <p className="text-[15px] leading-7 text-[#222]">{block.text}</p>;
    case "bulletList":
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-7 text-[#222]">
          {block.items.map((item) => (
            <li key={item.slice(0, 64)}>{item}</li>
          ))}
        </ul>
      );
    case "numberedList":
      return (
        <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-7 text-[#222]">
          {block.items.map((item, index) => (
            <li key={`${index}-${item.slice(0, 24)}`}>{item}</li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[#1F4E79] text-white">
                {block.headers.map((header) => (
                  <th
                    key={header}
                    className="border border-[#d0d7de] px-3 py-2 text-left font-semibold"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr
                  key={`row-${rowIndex}`}
                  className={rowIndex % 2 === 1 ? "bg-[#F7F9FC]" : "bg-white"}
                >
                  {block.headers.map((_, colIndex) => (
                    <td
                      key={`cell-${rowIndex}-${colIndex}`}
                      className="border border-[#d0d7de] px-3 py-2 text-[#222]"
                    >
                      {row[colIndex] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "callout": {
      const tone =
        block.variant === "warning"
          ? "border-amber-500/50 bg-amber-50"
          : block.variant === "important"
            ? "border-sky-600/40 bg-sky-50"
            : "border-slate-300 bg-slate-50";
      const label =
        block.variant === "warning"
          ? "注意"
          : block.variant === "important"
            ? "重要"
            : "注記";
      return (
        <aside className={`rounded-md border px-4 py-3 text-sm leading-relaxed ${tone}`}>
          <p className="mb-1 text-xs font-semibold tracking-wide text-slate-600">
            {label}
          </p>
          <p className="text-[#222]">{block.text}</p>
        </aside>
      );
    }
    case "imagePlaceholder":
      return (
        <div className="flex min-h-[140px] flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-slate-600">画像挿入位置</p>
          <p className="mt-1 text-xs text-slate-500">{block.caption}</p>
        </div>
      );
    case "keyCard":
      return (
        <div className="rounded-md border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-sm font-semibold text-[#1F4E79]">{block.title}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-[#222]">
            {block.items.map((item) => (
              <li key={item.slice(0, 48)}>{item}</li>
            ))}
          </ul>
        </div>
      );
    case "contact":
      return (
        <dl className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm sm:grid-cols-2">
          {block.fields.map((field) => (
            <div key={field.label}>
              <dt className="text-xs font-medium text-slate-500">{field.label}</dt>
              <dd className="text-[#222]">{field.value}</dd>
            </div>
          ))}
        </dl>
      );
    case "signature":
      return (
        <div className="space-y-3 pt-6">
          {block.lines.map((line) => (
            <p key={line} className="text-sm text-[#222]">
              {line}
            </p>
          ))}
        </div>
      );
    case "pageBreak":
      return (
        <div
          className="my-8 border-t border-dashed border-slate-300 pt-2 text-center text-[10px] tracking-[0.2em] text-slate-400"
          aria-hidden
        >
          ページ区切り
        </div>
      );
    default:
      return null;
  }
}

/**
 * A4-like on-screen preview — never raw Markdown / JSON.
 */
export function ArtifactDocumentPreview({
  assignment,
  content,
  title,
  templateOverride,
  orgProfile,
}: ArtifactDocumentPreviewProps) {
  const preview = useMemo(
    () =>
      buildArtifactPreview({
        assignment,
        content,
        title,
        templateOverride,
        orgProfile,
      }),
    [assignment, content, title, templateOverride, orgProfile],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">成果物プレビュー</p>
        <p className="text-xs text-[var(--foreground-muted)]">
          {preview.templateLabel}
          {preview.completionStatus === "needs_input" ? " · 入力不足あり" : ""}
        </p>
      </div>

      <div className="overflow-x-auto">
        <article
          className="mx-auto w-full max-w-[720px] origin-top scale-[0.92] rounded-sm bg-white text-[#222] shadow-[0_8px_30px_rgba(0,0,0,0.08)] ring-1 ring-black/5 sm:scale-100"
          style={{ fontFamily: '"Yu Gothic", "Hiragino Sans", sans-serif' }}
        >
          {preview.showHeader ? (
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3 text-[11px] text-slate-500 sm:px-10">
              <span>MINERVOT</span>
              <span>{preview.artifactLabel}</span>
            </header>
          ) : null}

          <div className="space-y-6 px-6 py-8 sm:px-10 sm:py-10">
            {preview.showCover ? (
              <div className="space-y-3 border-b border-slate-200 pb-8">
                <p className="text-xs font-semibold tracking-[0.18em] text-[#1F4E79]">
                  {preview.artifactLabel}
                </p>
                <h1 className="text-2xl font-semibold leading-snug tracking-tight text-[#1F4E79] sm:text-3xl">
                  {preview.title}
                </h1>
                {preview.subtitle ? (
                  <p className="text-base text-slate-600">{preview.subtitle}</p>
                ) : null}
                {preview.metaFields.length > 0 ? (
                  <dl className="grid gap-2 pt-2 sm:grid-cols-2">
                    {preview.metaFields.map((field) => (
                      <div key={field.label} className="text-sm">
                        <dt className="text-xs text-slate-500">{field.label}</dt>
                        <dd>{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold tracking-wide text-[#1F4E79]">
                  {preview.artifactLabel}
                </p>
                <h1 className="text-xl font-semibold text-[#1F4E79] sm:text-2xl">
                  {preview.title}
                </h1>
              </div>
            )}

            {preview.toc.length > 0 ? (
              <nav aria-label="目次" className="space-y-2 rounded-md bg-slate-50 px-4 py-4">
                <p className="text-sm font-semibold text-[#1F4E79]">目次</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
                  {preview.toc.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </nav>
            ) : null}

            {preview.summary ? (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold text-[#1F4E79]">概要</h2>
                <p className="text-[15px] leading-7">{preview.summary}</p>
              </section>
            ) : null}

            {preview.sections.map((section, sectionIndex) => {
              const HeadingTag =
                section.level === 1 ? "h2" : section.level === 2 ? "h3" : "h4";
              const headingClass =
                section.level === 1
                  ? "text-xl font-semibold text-[#1F4E79]"
                  : section.level === 2
                    ? "text-lg font-semibold text-[#1F4E79]"
                    : "text-base font-semibold text-[#1F4E79]";

              return (
                <section key={`${section.title}-${sectionIndex}`} className="space-y-3">
                  {section.pageBreakBefore ? (
                    <div className="border-t border-dashed border-slate-300 pt-2 text-center text-[10px] tracking-[0.2em] text-slate-400">
                      ページ区切り
                    </div>
                  ) : null}
                  <HeadingTag className={headingClass}>{section.title}</HeadingTag>
                  <div className="space-y-3">
                    {section.blocks.map((block, index) => (
                      <PreviewBlock
                        key={`${section.title}-${index}`}
                        block={block}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {preview.showFooter ? (
            <footer className="flex items-center justify-between border-t border-slate-200 px-6 py-3 text-[11px] text-slate-500 sm:px-10">
              <span>{preview.title}</span>
              {preview.showPageNumbers ? <span>1 / —</span> : <span />}
            </footer>
          ) : null}
        </article>
      </div>
    </div>
  );
}
