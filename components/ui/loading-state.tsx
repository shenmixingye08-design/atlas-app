export function LoadingState({
  message = "準備しています…",
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className="flex min-h-[12rem] flex-col items-center justify-center gap-4 py-24"
      role="status"
      aria-live="polite"
    >
      <div className="h-1 w-24 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div className="h-full w-1/2 rounded-full bg-accent/30 animate-shimmer" />
      </div>
      <p className="text-body text-[var(--text-secondary)]">{message}</p>
    </div>
  );
}
