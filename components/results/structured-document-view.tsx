"use client";

import {
  normalizeToStructuredDocument,
  type DocumentSection,
  type StructuredDocument,
} from "@/lib/deliverables/document";

function SectionView({ section }: { section: DocumentSection }) {
  switch (section.type) {
    case "heading": {
      const Tag = (`h${section.level}` as "h1" | "h2" | "h3");
      const className =
        section.level === 1
          ? "text-xl font-semibold text-foreground"
          : section.level === 2
            ? "text-lg font-semibold text-foreground"
            : "text-base font-semibold text-foreground";
      return <Tag className={className}>{section.text}</Tag>;
    }
    case "paragraph":
      return (
        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
          {section.text}
        </p>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-[var(--border-subtle)] pl-3 text-base leading-relaxed text-[var(--foreground-muted)]">
          {section.text}
        </blockquote>
      );
    case "bulletList":
      return (
        <ul className="list-disc space-y-1 pl-5 text-base leading-relaxed">
          {section.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "numberedList":
      return (
        <ol className="list-decimal space-y-1 pl-5 text-base leading-relaxed">
          {section.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            {section.headers.length > 0 && (
              <thead>
                <tr>
                  {section.headers.map((h) => (
                    <th
                      key={h}
                      className="border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-1 text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {section.rows.map((row, idx) => (
                <tr key={`r-${idx}`}>
                  {row.map((cell, cIdx) => (
                    <td
                      key={`c-${idx}-${cIdx}`}
                      className="border border-[var(--border-subtle)] px-2 py-1"
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
    case "pageBreak":
      return <hr className="border-[var(--border-subtle)]" />;
  }
}

export function StructuredDocumentView({
  source,
  titleHint,
  variant = "full",
}: {
  source: string;
  titleHint?: string;
  /** body = sections only (for nested preview sections). */
  variant?: "full" | "body";
}) {
  const result = normalizeToStructuredDocument(source, { titleHint });
  const doc: StructuredDocument = result.document;

  // Never show raw JSON / fences to end users.
  const looksRawJson =
    /^\s*[{\[]/.test(source.trim()) &&
    (source.includes('"content"') || source.includes('"type"'));
  if (looksRawJson && !result.normalizedSuccessfully) {
    return (
      <p className="text-sm text-[var(--foreground-muted)]">
        成果物を表示できませんでした。Markdown保存をお試しください。
      </p>
    );
  }

  if (variant === "body") {
    return (
      <div className="space-y-3">
        {doc.sections.map((section, index) => (
          <SectionView key={`${section.type}-${index}`} section={section} />
        ))}
      </div>
    );
  }

  return (
    <article className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {doc.title}
      </h1>
      {doc.summary ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--foreground-muted)]">
            概要
          </h2>
          <p className="text-base leading-relaxed">{doc.summary}</p>
        </section>
      ) : null}
      <div className="space-y-3">
        {doc.sections.map((section, index) => (
          <SectionView key={`${section.type}-${index}`} section={section} />
        ))}
      </div>
    </article>
  );
}
