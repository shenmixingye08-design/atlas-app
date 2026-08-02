type AuditEvent = {
  id: string;
  userId: string;
  action: string;
  memoryId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
};

function getLog(): AuditEvent[] {
  const g = globalThis as typeof globalThis & {
    __atlasPersonalMemoryAudit?: AuditEvent[];
  };
  if (!g.__atlasPersonalMemoryAudit) g.__atlasPersonalMemoryAudit = [];
  return g.__atlasPersonalMemoryAudit;
}

export function resetPersonalMemoryAuditForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasPersonalMemoryAudit?: AuditEvent[];
  };
  g.__atlasPersonalMemoryAudit = [];
}

export function appendPersonalMemoryAudit(input: {
  userId: string;
  action: string;
  memoryId: string | null;
  meta: Record<string, unknown>;
}): void {
  getLog().push({
    id: crypto.randomUUID(),
    userId: input.userId,
    action: input.action,
    memoryId: input.memoryId,
    meta: input.meta,
    createdAt: new Date().toISOString(),
  });
  // Keep bounded — never log secrets (callers redact)
  if (getLog().length > 2000) {
    getLog().splice(0, getLog().length - 2000);
  }
}

export function listPersonalMemoryAudit(userId: string): AuditEvent[] {
  return getLog().filter((e) => e.userId === userId);
}
