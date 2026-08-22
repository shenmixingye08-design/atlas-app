import { AsyncLocalStorage } from "node:async_hooks";

export type AutomationTickContext = {
  tickId: string;
  jobId?: string | null;
};

const storage = new AsyncLocalStorage<AutomationTickContext>();

export function runWithAutomationTickContext<T>(
  ctx: AutomationTickContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ctx, fn);
}

export function getAutomationTickContext(): AutomationTickContext | null {
  return storage.getStore() ?? null;
}

/** Short correlatable user ref — never the full id. */
export function safeUserRef(userId: string | null | undefined): string | null {
  const id = userId?.trim() ?? "";
  if (!id) return null;
  if (id.length <= 8) return `len:${id.length}`;
  return `${id.slice(0, 4)}…${id.slice(-3)}`;
}
