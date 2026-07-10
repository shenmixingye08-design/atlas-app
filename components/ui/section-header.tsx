import { cn } from "@/lib/design-system/cn";

type SectionHeaderProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  overline?: string;
  className?: string;
};

export function SectionHeader({
  title,
  description,
  action,
  overline,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div>
        {overline && <p className="text-overline mb-2">{overline}</p>}
        <h1 className="text-display text-foreground sm:text-[2.25rem]">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-caption">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
