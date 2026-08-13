"use client";

import Link from "next/link";

import { IconReuse, IconSpark } from "@/components/ui/icons";
import { trackAutomationFirstEvent } from "@/lib/automation-first/analytics";
import { cn } from "@/lib/design-system/cn";

export const HOME_ONE_TIME_HREF = "/workspace";
export const HOME_AUTOMATION_HREF = "/automations/new";

const ONE_TIME_EXAMPLES = [
  "Word",
  "Excel",
  "PDF",
  "PowerPoint",
  "文章",
  "画像から作成",
] as const;

const AUTOMATION_EXAMPLES = [
  "X投稿",
  "WordPress",
  "予定作成",
  "定期資料",
  "繰り返し仕事",
] as const;

function ExampleChips({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[length:var(--text-meta)] text-[var(--text-secondary)]"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function PrimaryActionCard({
  href,
  titleId,
  title,
  description,
  examples,
  cta,
  icon,
  compact,
  onClick,
}: {
  href: string;
  titleId: string;
  title: string;
  description: string;
  examples: readonly string[];
  cta: string;
  icon: React.ReactNode;
  compact: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-labelledby={titleId}
      className={cn(
        "group flex h-full min-h-[var(--touch-target)] flex-col rounded-[var(--radius-2xl)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-md)] transition-colors duration-[var(--motion-fast)]",
        "hover:border-[color-mix(in_srgb,var(--brand)_28%,var(--border))] hover:shadow-[var(--shadow-lg)]",
        "focus-ring",
        compact ? "p-4 sm:p-5" : "p-5 sm:p-6",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl bg-[var(--brand-muted)] text-[var(--brand)]",
          compact ? "h-10 w-10" : "h-12 w-12",
        )}
        aria-hidden
      >
        {icon}
      </div>
      <h2
        id={titleId}
        className={cn(
          "mt-4 font-semibold tracking-tight text-[var(--text-primary)]",
          compact
            ? "text-lg sm:text-xl"
            : "text-xl sm:text-2xl",
        )}
      >
        {title}
      </h2>
      <p
        className={cn(
          "mt-2 text-[length:var(--text-body)] leading-[var(--leading-body)] text-[var(--text-secondary)]",
          compact && "line-clamp-2",
        )}
      >
        {description}
      </p>
      <ExampleChips items={examples} />
      <span
        className={cn(
          "btn-brand mt-5 w-full",
          "pointer-events-none",
        )}
      >
        {cta}
      </span>
    </Link>
  );
}

export function HomePrimaryActions({ compact = false }: { compact?: boolean }) {
  return (
    <section
      data-testid="home-primary-actions"
      aria-label="MINERVOTに任せる方法"
      className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4"
    >
      <PrimaryActionCard
        href={HOME_ONE_TIME_HREF}
        titleId="home-primary-one-time"
        title="今すぐ1件任せる"
        description="必要な仕事を1つ依頼。Word・Excel・PDF・PowerPoint・文章作成などをMINERVOTが完成まで進めます。"
        examples={ONE_TIME_EXAMPLES}
        cta="今すぐお願いする"
        compact={compact}
        icon={<IconSpark className={compact ? "h-5 w-5" : "h-6 w-6"} />}
        onClick={() => {
          trackAutomationFirstEvent("one_time_request_clicked", {
            source: "home_primary",
          });
          trackAutomationFirstEvent("home_primary_one_time_clicked", {
            source: "home_primary",
          });
        }}
      />
      <PrimaryActionCard
        href={HOME_AUTOMATION_HREF}
        titleId="home-primary-automation"
        title="繰り返し任せる"
        description="毎日・毎週の仕事を一度設定。次回からMINERVOTが自動で実行します。"
        examples={AUTOMATION_EXAMPLES}
        cta="自動化を作る"
        compact={compact}
        icon={<IconReuse className={compact ? "h-5 w-5" : "h-6 w-6"} />}
        onClick={() => {
          trackAutomationFirstEvent("primary_automation_cta_clicked", {
            source: "home_primary",
          });
          trackAutomationFirstEvent("home_primary_automation_clicked", {
            source: "home_primary",
          });
        }}
      />
    </section>
  );
}
