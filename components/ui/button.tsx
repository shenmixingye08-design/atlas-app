import { cn } from "@/lib/design-system/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  /* Primary = brand accent (emerald under AF) */
  primary:
    "bg-accent text-[var(--accent-foreground)] shadow-[var(--shadow-sm)] hover:bg-[var(--accent-hover)] active:scale-[0.99]",
  /* Secondary = elevated white / surface with border */
  secondary:
    "border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)] active:scale-[0.99]",
  /* Ghost = text only */
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]",
  /* Danger = red */
  danger:
    "bg-[var(--error)] text-white shadow-[var(--shadow-sm)] hover:opacity-90 active:scale-[0.99]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[40px] px-4 text-sm rounded-[var(--radius-md)]",
  md: "h-11 min-h-[44px] px-5 text-sm rounded-[var(--radius-md)]",
  lg: "h-12 min-h-[44px] px-6 text-base rounded-[var(--radius-md)]",
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
        "inline-flex items-center justify-center gap-2 font-semibold transition-[color,background-color,box-shadow,transform,opacity] duration-[var(--motion-base)] focus-ring disabled:cursor-not-allowed disabled:opacity-40",
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
