/** Tenant key helpers for knowledge isolation. */

export function knowledgeTenantKey(userId: string, entryId: string): string {
  return `${userId}::${entryId}`;
}

export function parseKnowledgeTenantKey(
  key: string
): { userId: string; entryId: string } | null {
  const idx = key.indexOf("::");
  if (idx <= 0) return null;
  return {
    userId: key.slice(0, idx),
    entryId: key.slice(idx + 2),
  };
}
