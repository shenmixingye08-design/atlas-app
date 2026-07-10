export function LoadingState({
  message = "読み込み中",
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24" role="status" aria-live="polite">
      <div className="h-1 w-24 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div className="h-full w-1/2 rounded-full bg-accent/30 animate-shimmer" />
      </div>
      <p className="animate-soft-pulse text-body">{message}</p>
    </div>
  );
}
