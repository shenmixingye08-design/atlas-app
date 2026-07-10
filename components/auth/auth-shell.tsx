import Link from "next/link";

import { AtlasBackground } from "@/components/atlas-background";
import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { ThemeToggle } from "@/components/theme/theme-toggle";

type AuthShellProps = {
  children: React.ReactNode;
  title: string;
  subtitle: string;
};

export function AuthShell({ children, title, subtitle }: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--text-primary)]">
      <AtlasBackground />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent shadow-[var(--shadow-md)]">
              <span className="text-sm font-bold text-white">A</span>
            </div>
            <span className="text-base font-semibold tracking-tight">ATLAS</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{subtitle}</p>
          </div>
          <div className="glass-strong w-full rounded-2xl bg-[var(--card)] p-4 sm:p-6">
            {children}
          </div>
          <LegalFooterLinks
            variant="muted"
            className="mt-6 justify-center text-center"
          />
        </div>
      </div>
    </div>
  );
}
