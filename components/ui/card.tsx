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
        "rounded-[var(--radius-card)] bg-[var(--surface-raised)]",
        variant === "default" && "border border-[var(--border-subtle)]",
        variant === "elevated" && "shadow-[var(--shadow-subtle)]",
        variant === "interactive" &&
          "motion-press-card cursor-pointer border border-[var(--border-subtle)] [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[var(--shadow-floating)]",
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
