import { cn } from "@/lib/design-system/cn";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
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
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-[var(--text-caption)] text-[var(--text-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-[length:var(--text-page-title)] font-semibold tracking-tight text-[var(--text-primary)]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-[length:var(--text-body)] leading-[var(--leading-body)] text-[var(--text-secondary)]">
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
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  heading?: "h2" | "h3";
}) {
  const Heading = heading;
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <Heading className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]">
          {title}
        </Heading>
        {description ? (
          <p className="mt-0.5 text-[var(--text-caption)] text-[var(--text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
