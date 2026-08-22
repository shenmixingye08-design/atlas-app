/**
 * Dismissed proposals must not reappear. Persistable snapshot — no globalThis SoT.
 */

export type WorkLoopDismissState = {
  userId: string;
  keys: string[];
};

const persistable = new Map<string, string[]>();

export function listDismissedKeys(userId: string): string[] {
  return [...(persistable.get(userId) ?? [])];
}

export function dismissProposal(userId: string, fingerprint: string): void {
  const current = persistable.get(userId) ?? [];
  if (current.includes(fingerprint)) return;
  persistable.set(userId, [...current, fingerprint]);
}

export function isProposalDismissed(userId: string, fingerprint: string): boolean {
  return (persistable.get(userId) ?? []).includes(fingerprint);
}

export function snapshotDismissState(userId: string): WorkLoopDismissState {
  return { userId, keys: listDismissedKeys(userId) };
}

export function restoreDismissState(snapshot: WorkLoopDismissState): void {
  persistable.set(snapshot.userId, [...snapshot.keys]);
}

export function restoreAfterColdStart<T>(snapshot: T): T {
  return structuredClone(snapshot);
}

export function resetDismissStoreForTests(): void {
  persistable.clear();
}
