import type { LegalArticle as LegalArticleType } from "@/lib/legal/types";
import { LegalArticle } from "@/components/legal/legal-article";
import { cn } from "@/lib/design-system/cn";

type LegalItemCardProps = {
  item: LegalArticleType;
  formatSectionLabel?: (item: LegalArticleType) => string;
  className?: string;
};

export function LegalItemCard({
  item,
  formatSectionLabel,
  className,
}: LegalItemCardProps) {
  return (
    <div
      className={cn(
        "legal-item-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--terms-bg)] p-5 shadow-[var(--shadow-sm)] sm:p-6",
        className,
      )}
    >
      <LegalArticle
        article={item}
        formatSectionLabel={formatSectionLabel}
      />
    </div>
  );
}
