/**
 * Defer effect work off the synchronous effect body.
 *
 * React Compiler's `react-hooks/set-state-in-effect` rejects setState that runs
 * synchronously inside `useEffect`. Mount-time data loads and preference sync
 * still need an effect; scheduling via `queueMicrotask` keeps the update in a
 * callback (allowed) without disabling the rule.
 */
export function scheduleMountWork(work: () => void): () => void {
  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) {
      work();
    }
  });
  return () => {
    cancelled = true;
  };
}
