import { cn } from "@/lib/design-system/cn";

type BadgeVariant = "default" | "accent" | "success" | "warning" | "error";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const VARIANT: Record<BadgeVariant, string> = {
  default:
    "bg-[var(--surface-muted)] text-[var(--text-secondary)] ring-[var(--border)]",
  accent:
    "bg-[var(--accent-muted)] text-[var(--accent)] ring-[var(--accent)]/25",
  success:
    "bg-[var(--success-bg)] text-[var(--success)] ring-[var(--success)]/30",
  warning:
    "bg-[var(--warning-bg)] text-[var(--warning)] ring-[var(--warning)]/30",
  error: "bg-[var(--error-bg)] text-[var(--error)] ring-[var(--error)]/30",
};

export function Badge({
  variant = "default",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        VARIANT[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
