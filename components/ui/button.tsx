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
    "bg-[var(--primary)] text-[var(--accent-foreground)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-pressed)] shadow-[var(--shadow-cta)]",
  secondary:
    "bg-[var(--surface-muted)] text-foreground hover:bg-[var(--secondary-hover)]",
  ghost:
    "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-foreground",
  danger:
    "bg-[var(--error-bg)] text-[var(--error)] hover:bg-[var(--error-bg)]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[44px] px-4 text-sm rounded-[var(--radius-large)]",
  md: "h-11 min-h-[44px] px-6 text-sm rounded-[var(--radius-large)]",
  lg: "h-12 min-h-[44px] px-8 text-base rounded-[var(--radius-large)]",
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
        "inline-flex items-center justify-center gap-2 font-medium transition-[transform,background-color,box-shadow,color,opacity] duration-[var(--motion-fast)] focus-ring disabled:cursor-not-allowed disabled:opacity-40",
        !isLoading && !disabled && "motion-press",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
      aria-busy={isLoading || undefined}
    >
      <span
        className={
          isLoading
            ? "inline-flex items-center gap-2 opacity-80 transition-opacity duration-[var(--motion-fast)]"
            : "inline-flex items-center gap-2 transition-opacity duration-[var(--motion-fast)]"
        }
      >
        {isLoading ? (
          <span
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden
          />
        ) : null}
        {children}
      </span>
    </button>
  );
}
