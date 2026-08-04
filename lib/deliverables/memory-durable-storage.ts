/**
 * Test-only durable object store (P0-3).
 * Survives process deliverable Map clears — simulates cross-instance Storage.
 * Forbidden in Production (asserted by storage-backend).
 */

export type MemoryDurableObject = {
  buffer: Buffer;
  contentType: string;
  byteSize: number;
  checksum: string;
  createdAt: string;
};

type Bucket = Map<string, MemoryDurableObject>;

function getBucket(): Bucket {
  const scope = globalThis as typeof globalThis & {
    __atlasMemoryDurableObjects?: Bucket;
  };
  if (!scope.__atlasMemoryDurableObjects) {
    scope.__atlasMemoryDurableObjects = new Map();
  }
  return scope.__atlasMemoryDurableObjects;
}

export const MEMORY_DURABLE_BUCKET = "memory-durable";

export function resetMemoryDurableStorageForTests(): void {
  getBucket().clear();
}

export function memoryDurablePut(input: {
  path: string;
  buffer: Buffer;
  contentType: string;
  checksum: string;
  overwrite?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const bucket = getBucket();
  if (!input.overwrite && bucket.has(input.path)) {
    const existing = bucket.get(input.path)!;
    if (existing.checksum === input.checksum) return { ok: true };
    return { ok: false, error: "duplicate_path_checksum_mismatch" };
  }
  bucket.set(input.path, {
    buffer: Buffer.from(input.buffer),
    contentType: input.contentType,
    byteSize: input.buffer.byteLength,
    checksum: input.checksum,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

export function memoryDurableGet(
  path: string,
): MemoryDurableObject | null {
  return getBucket().get(path) ?? null;
}

export function memoryDurableDelete(path: string): boolean {
  return getBucket().delete(path);
}

export function memoryDurableList(): string[] {
  return [...getBucket().keys()];
}
