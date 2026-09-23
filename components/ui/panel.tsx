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
      className={cn("ui-card p-5 sm:p-6", className)}
      {...props}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="ui-section-title">{title}</h2>
            )}
            {description && (
              <p className="ui-section-desc">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
