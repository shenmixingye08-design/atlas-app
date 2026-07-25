"use client";

import { useMemo } from "react";

import { buildArtifactPreview } from "@/lib/artifact-engine/build-preview";
import type { ArtifactPreviewBlock } from "@/lib/artifact-engine/types";

type ArtifactDocumentPreviewProps = {
  assignment: string;
  content: string;
  title?: string;
};

function PreviewBlock({ block }: { block: ArtifactPreviewBlock }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="text-base leading-relaxed text-foreground">{block.text}</p>
      );
    case "bulletList":
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-base leading-relaxed text-foreground">
          {block.items.map((item) => (
            <li key={item.slice(0, 48)}>{item}</li>
          ))}
        </ul>
      );
    case "numberedList":
      return (
        <ol className="list-decimal space-y-1.5 pl-5 text-base leading-relaxed text-foreground">
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
              <tr className="bg-[var(--background-muted)]">
                {block.headers.map((header) => (
                  <th
                    key={header}
                    className="border border-[var(--border-subtle)] px-3 py-2 text-left font-semibold text-foreground"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {block.headers.map((_, colIndex) => (
                    <td
                      key={`cell-${rowIndex}-${colIndex}`}
                      className="border border-[var(--border-subtle)] px-3 py-2 text-foreground"
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
          ? "border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10"
          : block.variant === "important"
            ? "border-accent/40 bg-accent/10"
            : "border-[var(--border-subtle)] bg-[var(--background-muted)]/60";
      const label =
        block.variant === "warning"
          ? "注意"
          : block.variant === "important"
            ? "重要"
            : "注記";
      return (
        <aside
          className={`rounded-[var(--radius-lg)] border px-4 py-3 text-sm leading-relaxed text-foreground ${tone}`}
        >
          <p className="mb-1 text-xs font-semibold tracking-wide text-[var(--foreground-muted)]">
            {label}
          </p>
          <p>{block.text}</p>
        </aside>
      );
    }
    case "imagePlaceholder":
      return (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] bg-[var(--background-muted)]/40 px-4 py-8 text-center">
          <p className="text-sm font-medium text-[var(--foreground-muted)]">
            画像挿入位置
          </p>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">
            {block.caption}
          </p>
        </div>
      );
    case "keyCard":
      return (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-4">
          <p className="text-sm font-semibold text-foreground">{block.title}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground">
            {block.items.map((item) => (
              <li key={item.slice(0, 48)}>{item}</li>
            ))}
          </ul>
        </div>
      );
    default:
      return null;
  }
}

/**
 * Word-quality on-screen preview — fully rendered, never raw Markdown.
 */
export function ArtifactDocumentPreview({
  assignment,
  content,
  title,
}: ArtifactDocumentPreviewProps) {
  const preview = useMemo(
    () =>
      buildArtifactPreview({
        assignment,
        content,
        title,
      }),
    [assignment, content, title],
  );

  return (
    <article className="space-y-8 font-sans">
      <header className="space-y-3 border-b border-[var(--border-subtle)] pb-6">
        <p className="text-xs font-semibold tracking-wide text-accent">
          {preview.artifactLabel}
          {preview.documentTypeLabel !== preview.artifactLabel
            ? ` · ${preview.documentTypeLabel}`
            : ""}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {preview.title}
        </h1>
        {preview.subtitle ? (
          <p className="text-base text-[var(--foreground-muted)]">
            {preview.subtitle}
          </p>
        ) : null}
        {preview.metaFields.length > 0 ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            {preview.metaFields.map((field) => (
              <div key={field.label} className="text-sm">
                <dt className="font-medium text-[var(--foreground-muted)]">
                  {field.label}
                </dt>
                <dd className="text-foreground">{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>

      {preview.toc.length > 0 ? (
        <nav aria-label="目次" className="space-y-2">
          <p className="text-sm font-semibold text-foreground">目次</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[var(--foreground-muted)]">
            {preview.toc.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </nav>
      ) : null}

      {preview.sections.map((section) => {
        const HeadingTag = section.level === 1 ? "h2" : section.level === 2 ? "h3" : "h4";
        const headingClass =
          section.level === 1
            ? "text-xl font-semibold text-foreground"
            : section.level === 2
              ? "text-lg font-semibold text-foreground"
              : "text-base font-semibold text-foreground";

        return (
          <section key={`${section.level}-${section.title}`} className="space-y-4">
            <HeadingTag className={headingClass}>{section.title}</HeadingTag>
            <div className="space-y-4">
              {section.blocks.map((block, index) => (
                <PreviewBlock key={`${section.title}-${index}`} block={block} />
              ))}
            </div>
          </section>
        );
      })}
    </article>
  );
}
