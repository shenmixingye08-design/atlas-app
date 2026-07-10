import { cn } from "@/lib/design-system/cn";

type SkeletonProps = {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
};

export function Skeleton({ className, variant = "rectangular" }: SkeletonProps) {
  return (
    <div
      className={cn(
        "skeleton",
        variant === "text" && "h-4 w-full",
        variant === "circular" && "h-10 w-10 rounded-full",
        variant === "rectangular" && "h-24 w-full",
        className,
      )}
      aria-hidden="true"
    />
  );
}

type SkeletonGroupProps = {
  lines?: number;
  className?: string;
};

export function SkeletonGroup({ lines = 3, className }: SkeletonGroupProps) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={i === lines - 1 ? "w-2/3" : "w-full"}
        />
      ))}
    </div>
  );
}
