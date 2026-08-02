import { cn } from "@/lib/design-system/cn";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "elevated" | "interactive";
  padding?: "none" | "sm" | "md" | "lg";
};

const PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-4 sm:p-6",
  lg: "p-6 sm:p-8",
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
        "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-md)]",
        variant === "interactive" &&
          "cursor-pointer transition-[box-shadow,transform] duration-[var(--motion-base)] hover:shadow-[var(--shadow-lg)] active:scale-[0.995]",
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
