/** Owner-controlled account suspension flags (in-memory + optional durable sync later). */

export type OwnerUserAdminRecord = {
  userId: string;
  suspended: boolean;
  updatedAt: string;
  reason: string | null;
};

type Bucket = Map<string, OwnerUserAdminRecord>;

function getBucket(): Bucket {
  const scope = globalThis as typeof globalThis & {
    __atlasOwnerUserAdmin?: Bucket;
  };
  if (!scope.__atlasOwnerUserAdmin) {
    scope.__atlasOwnerUserAdmin = new Map();
  }
  return scope.__atlasOwnerUserAdmin;
}

export function getOwnerUserAdminRecord(
  userId: string,
): OwnerUserAdminRecord | null {
  return getBucket().get(userId) ?? null;
}

export function isOwnerAccountSuspended(userId: string): boolean {
  return getBucket().get(userId)?.suspended === true;
}

export function setOwnerAccountSuspended(input: {
  userId: string;
  suspended: boolean;
  reason?: string | null;
}): OwnerUserAdminRecord {
  const record: OwnerUserAdminRecord = {
    userId: input.userId,
    suspended: input.suspended,
    updatedAt: new Date().toISOString(),
    reason: input.reason?.trim() || null,
  };
  getBucket().set(input.userId, record);
  return record;
}

export function listOwnerUserAdminRecords(): OwnerUserAdminRecord[] {
  return [...getBucket().values()];
}

export function resetOwnerUserAdminStoreForTests(): void {
  getBucket().clear();
}
