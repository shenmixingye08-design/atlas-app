import Link from "next/link";

import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

type SystemPageLayoutProps = {
  icon: React.ReactNode;
  badge?: string;
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export function SystemPageLayout({
  icon,
  badge,
  title,
  description,
  children,
  className,
}: SystemPageLayoutProps) {
  return (
    <div
      className={cn(
        "terms-page system-page min-h-screen bg-[var(--terms-bg)] text-[var(--terms-heading)]",
        className,
      )}
    >
      <header className="border-b border-[var(--border-subtle)] bg-[var(--terms-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow-md shadow-blue-500/20">
              <span className="text-sm font-bold text-white">A</span>
            </div>
            <span className="text-base font-semibold tracking-tight">{ui.brand}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-[720px] flex-col items-center px-4 py-12 text-center sm:px-8 sm:py-16">
        <div className="system-page-icon mb-6 flex h-28 w-28 items-center justify-center rounded-[28px] bg-[var(--terms-toc-hover-bg)] shadow-[var(--shadow-sm)] sm:h-32 sm:w-32">
          {icon}
        </div>

        {badge ? (
          <p className="mb-2 text-sm font-medium text-[var(--terms-accent)]">{badge}</p>
        ) : null}

        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <div className="mt-4 max-w-lg text-base leading-relaxed text-[var(--terms-muted)]">
          {description}
        </div>

        {children ? <div className="mt-8 w-full max-w-lg">{children}</div> : null}
      </main>
    </div>
  );
}

type SystemPageActionsProps = {
  children: React.ReactNode;
  className?: string;
};

export function SystemPageActions({ children, className }: SystemPageActionsProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
    >
      {children}
    </div>
  );
}

type SystemPageLinkGridProps = {
  title: string;
  links: readonly { href: string; label: string }[];
};

export function SystemPageLinkGrid({ title, links }: SystemPageLinkGridProps) {
  return (
    <div className="system-page-card mt-8 w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--terms-bg)] p-5 text-left shadow-[var(--shadow-sm)] sm:p-6">
      <p className="text-sm font-semibold text-[var(--terms-heading)]">{title}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-xl px-3 py-2 text-sm text-[var(--terms-accent)] transition-colors hover:bg-[var(--terms-toc-hover-bg)] hover:underline"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
