import { cn } from "@/lib/design-system/cn";

type SystemPageIconProps = {
  variant: "404" | "500" | "maintenance" | "offline" | "status";
  className?: string;
};

export function SystemPageIcon({ variant, className }: SystemPageIconProps) {
  const shared = cn("h-14 w-14 sm:h-16 sm:w-16", className);

  if (variant === "404") {
    return (
      <svg viewBox="0 0 64 64" className={shared} aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[var(--terms-accent)]" />
        <path d="M22 26h20M22 38h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[var(--terms-heading)]" />
        <circle cx="24" cy="24" r="2" fill="currentColor" className="text-[var(--terms-heading)]" />
        <circle cx="40" cy="24" r="2" fill="currentColor" className="text-[var(--terms-heading)]" />
      </svg>
    );
  }

  if (variant === "500") {
    return (
      <svg viewBox="0 0 64 64" className={shared} aria-hidden="true">
        <path d="M32 8 L56 48 H8 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" className="text-[var(--warning)]" />
        <path d="M32 24v14M32 44h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-[var(--terms-heading)]" />
      </svg>
    );
  }

  if (variant === "maintenance") {
    return (
      <svg viewBox="0 0 64 64" className={shared} aria-hidden="true">
        <path d="M32 12a14 14 0 0 1 14 14v4h4v8H14v-8h4v-4a14 14 0 0 1 14-14z" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[var(--terms-accent)]" />
        <path d="M26 48h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[var(--terms-heading)]" />
        <circle cx="32" cy="26" r="4" fill="currentColor" className="text-[var(--terms-heading)]" />
      </svg>
    );
  }

  if (variant === "offline") {
    return (
      <svg viewBox="0 0 64 64" className={shared} aria-hidden="true">
        <path d="M10 32c8-8 18-12 22-12s14 4 22 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[var(--terms-muted)]" />
        <path d="M18 40c5-5 10-7 14-7s9 2 14 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[var(--terms-muted)]" />
        <path d="M26 48c2-2 4-3 6-3s4 1 6 3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[var(--terms-muted)]" />
        <path d="M8 8l48 48" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-[var(--error)]" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className={shared} aria-hidden="true">
      <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[var(--success)]" />
      <path d="M22 33l7 7 13-14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--success)]" />
    </svg>
  );
}
