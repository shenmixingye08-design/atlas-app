import { cn } from "@/lib/design-system/cn";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <p className="ui-eyebrow flex items-center gap-1.5">{eyebrow}</p>
        ) : null}
        <h1 className="text-[length:var(--text-page-title)] font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-[1.75rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-[length:var(--text-label)] leading-relaxed text-[var(--text-secondary)] sm:text-[length:var(--text-body)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  heading = "h2",
  id,
}: {
  title: string;
  id?: string;
  description?: string;
  action?: React.ReactNode;
  heading?: "h2" | "h3";
}) {
  const Heading = heading;
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <Heading id={id} className="ui-section-title scroll-mt-24">
          {title}
        </Heading>
        {description ? <p className="ui-section-desc">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
