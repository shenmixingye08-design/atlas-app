"use client";

import Link from "next/link";

import { SectionHeader } from "@/components/automation-first/page-header";
import { IconArtifact, IconDownload, IconLink } from "@/components/ui/icons";
import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import {
  ARTIFACT_TYPE_LABEL,
  artifactFileTypeFromLabel,
  type ArtifactFileType,
} from "@/lib/automation-first/artifact-type";
import { cn } from "@/lib/design-system/cn";

export type RecentDeliverableItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  meta: string;
  /** Direct file / external URL when the run stored one. */
  url?: string | null;
};

const TYPE_TONE: Record<ArtifactFileType, string> = {
  docx: "text-[var(--info)] bg-[color-mix(in_oklch,var(--info)_11%,transparent)]",
  xlsx: "text-[var(--success)] bg-[var(--success-bg)]",
  pdf: "text-[var(--danger)] bg-[var(--error-bg)]",
  pptx: "text-[var(--warning)] bg-[var(--warning-bg)]",
  other: "text-[var(--brand)] bg-[color-mix(in_oklch,var(--brand)_11%,transparent)]",
};

function track(id: string, source: string) {
  trackAutomationFirstEvent("artifact_opened", { id, source });
}

/**
 * "What MINERVOT finished for you" — deliverables first, as cards with
 * file type and a direct open/download action when a URL exists.
 */
export function RecentDeliverables({ items }: { items: RecentDeliverableItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="af-completed-heading" className="space-y-2.5">
      <SectionHeader
        heading="h3"
        id="af-completed-heading"
        title="最近完成したもの"
        description="MINERVOTが仕上げた成果物"
        action={
          <Link
            href="/history"
            className="ui-link"
          >
            すべて見る
          </Link>
        }
      />
      <ul className="animate-stagger grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {items.map((item) => {
          const type = artifactFileTypeFromLabel(item.detail);
          const external = Boolean(item.url && /^https?:\/\//i.test(item.url));
          return (
            <li
              key={item.id}
              className="motion-press-card ui-card ui-card-interactive group relative flex items-center gap-3 p-3.5"
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl",
                  TYPE_TONE[type],
                )}
              >
                <IconArtifact className="h-4 w-4" />
                <span className="mt-0.5 text-[9px] font-bold uppercase leading-none tracking-wide">
                  {type === "other" ? "" : type}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  onClick={() => track(item.id, "home_completed")}
                  className="block truncate text-sm font-semibold text-[var(--text-primary)] outline-none after:absolute after:inset-0 after:rounded-[var(--radius-lg)] focus-visible:after:ring-2 focus-visible:after:ring-[var(--focus-ring)]"
                >
                  {item.title}
                </Link>
                <p className="truncate text-[length:var(--text-meta)] text-[var(--text-muted)]">
                  <span className="sr-only">{ARTIFACT_TYPE_LABEL[type]}: </span>
                  {item.detail}
                  {item.meta ? ` · ${item.meta}` : ""}
                </p>
              </div>
              {item.url ? (
                <a
                  href={item.url}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  onClick={() => track(item.id, "home_completed_direct")}
                  aria-label={external ? `${item.detail}を新しいタブで開く` : `${item.detail}を開く`}
                  className="focus-ring relative z-10 inline-flex h-[var(--touch-target)] w-[var(--touch-target)] shrink-0 items-center justify-center rounded-full text-[var(--brand)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--brand-muted)]"
                >
                  {external ? (
                    <IconLink className="h-[18px] w-[18px]" />
                  ) : (
                    <IconDownload className="h-[18px] w-[18px]" />
                  )}
                </a>
              ) : (
                <span aria-hidden className="ui-chevron">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
