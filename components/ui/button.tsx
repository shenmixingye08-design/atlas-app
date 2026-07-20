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
    "border border-[#74172A] bg-[#74172A] text-white shadow-[0_10px_28px_rgba(116,23,42,0.18)] hover:-translate-y-0.5 hover:bg-[#5F1222] hover:shadow-[0_14px_34px_rgba(116,23,42,0.26)] active:scale-[0.98]",

  secondary:
    "border border-[#74172A]/15 bg-white text-[#74172A] shadow-sm hover:-translate-y-0.5 hover:border-[#74172A]/25 hover:bg-[#FAF6F5] active:scale-[0.98]",

  ghost:
    "text-[#75686B] hover:bg-[#74172A]/[0.05] hover:text-[#74172A]",

  danger:
    "bg-[var(--error-bg)] text-[var(--error)] hover:bg-[var(--error-bg)]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[44px] rounded-full px-4 text-sm",
  md: "h-11 min-h-[44px] rounded-full px-6 text-sm",
  lg: "h-12 min-h-[44px] rounded-full px-8 text-base",
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
