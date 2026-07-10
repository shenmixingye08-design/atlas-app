import { cn } from "@/lib/design-system/cn";

type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: string;
  description?: string;
  action?: React.ReactNode;
};

export function Panel({
  title,
  description,
  action,
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <section
      className={cn("glass-strong rounded-[var(--radius-2xl)] p-5 sm:p-6", className)}
      {...props}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-title text-foreground">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-caption">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
