import { cn } from "@/lib/design-system/cn";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "elevated" | "interactive";
  padding?: "none" | "sm" | "md" | "lg";
};

const PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-3.5 sm:p-4",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-7",
};

export function Card({
  variant = "default",
  padding = "md",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-2xl)] bg-[var(--card)]",
        (variant === "default" || variant === "elevated") && "shadow-[var(--shadow-md)]",
        variant === "interactive" &&
          "cursor-pointer shadow-[var(--shadow-md)] transition-all duration-[var(--motion-base)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] active:translate-y-0 active:shadow-[var(--shadow-md)]",
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
