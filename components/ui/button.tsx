import { cn } from "@/lib/design-system/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[var(--brand-hover)] active:scale-[0.98] shadow-[var(--shadow-cta)] hover:shadow-[0_16px_40px_rgba(116,23,42,0.24)]",
  secondary:
    "bg-[var(--surface-muted)] text-foreground hover:bg-[var(--secondary-hover)] active:scale-[0.98]",
  ghost:
    "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-foreground active:scale-[0.98]",
  danger:
    "bg-[var(--error-bg)] text-[var(--error)] hover:bg-[var(--error-bg)] active:scale-[0.98]",
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[44px] px-4 text-sm rounded-full",
  md: "h-11 min-h-[44px] px-6 text-sm rounded-full",
  lg: "h-12 min-h-[44px] px-8 text-base rounded-full",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-[var(--motion-base)] focus-ring disabled:cursor-not-allowed disabled:opacity-40",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {isLoading ? "…" : children}
    </button>
  );
}
