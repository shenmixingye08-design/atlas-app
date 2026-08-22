/**
 * Dismissed proposals must not reappear. Persistable snapshot — no globalThis SoT.
 */

export type WorkLoopDismissState = {
  userId: string;
  keys: string[];
};

const persistable = new Map<string, string[]>();
const STORAGE_PREFIX = "minervot-work-loop-dismiss:";

function readBrowserKeys(userId: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : null;
  } catch {
    return null;
  }
}

function writeBrowserKeys(userId: string, keys: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(keys));
}

export function listDismissedKeys(userId: string): string[] {
  const fromMemory = persistable.get(userId);
  if (fromMemory) return [...fromMemory];
  const fromBrowser = readBrowserKeys(userId);
  if (fromBrowser) {
    persistable.set(userId, fromBrowser);
    return [...fromBrowser];
  }
  return [];
}

export function dismissProposal(userId: string, fingerprint: string): void {
  const current = listDismissedKeys(userId);
  if (current.includes(fingerprint)) return;
  const next = [...current, fingerprint];
  persistable.set(userId, next);
  writeBrowserKeys(userId, next);
}

export function isProposalDismissed(userId: string, fingerprint: string): boolean {
  return (persistable.get(userId) ?? []).includes(fingerprint);
}

export function snapshotDismissState(userId: string): WorkLoopDismissState {
  return { userId, keys: listDismissedKeys(userId) };
}

export function restoreDismissState(snapshot: WorkLoopDismissState): void {
  persistable.set(snapshot.userId, [...snapshot.keys]);
  writeBrowserKeys(snapshot.userId, snapshot.keys);
}

export function restoreAfterColdStart<T>(snapshot: T): T {
  return structuredClone(snapshot);
}

export function resetDismissStoreForTests(): void {
  persistable.clear();
}
