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
        // Shared UI kit (globals.css @layer components): one card language
        // across logged-in screens. Utilities in className still override.
        "ui-card",
        variant === "interactive" &&
          "ui-card-interactive motion-press-card cursor-pointer",
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
