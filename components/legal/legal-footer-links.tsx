import Link from "next/link";

import { ui } from "@/lib/i18n";
import { cn } from "@/lib/design-system/cn";

type LegalFooterLinksProps = {
  className?: string;
  /** Visual variant for dark auth screens vs light landing/footer */
  variant?: "light" | "dark" | "muted";
};

export function LegalFooterLinks({
  className,
  variant = "muted",
}: LegalFooterLinksProps) {
  const linkClass =
    variant === "dark"
      ? "text-zinc-400 transition-colors hover:text-white hover:underline"
      : variant === "light"
        ? "text-[var(--foreground-muted)] transition-colors hover:text-[var(--accent)] hover:underline"
        : "text-[var(--foreground-muted)] transition-colors hover:text-[var(--accent)] hover:underline";

  return (
    <nav
      aria-label={ui.legal.navLabel}
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-sm", className)}
    >
      <Link href="/terms" className={linkClass}>
        {ui.legal.termsLink}
      </Link>
      <Link href="/privacy" className={linkClass}>
        {ui.legal.privacyLink}
      </Link>
      <Link href="/legal" className={linkClass}>
        {ui.legal.commercialLink}
      </Link>
      <Link href="/contact" className={linkClass}>
        {ui.contact.link}
      </Link>
      <Link href="/status" className={linkClass}>
        {ui.systemPages.statusTitle}
      </Link>
    </nav>
  );
}
