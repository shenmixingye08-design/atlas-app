import { randomInt } from "crypto";

export type LineUserLink = {
  atlasUserId: string;
  lineUserId: string;
  displayName: string | null;
  linkedAt: string;
};

export type LineLinkCode = {
  code: string;
  atlasUserId: string;
  createdAt: number;
  expiresAt: number;
};

type LineLinkBucket = {
  byAtlasUserId: Map<string, LineUserLink>;
  byLineUserId: Map<string, LineUserLink>;
  codes: Map<string, LineLinkCode>;
};

const CODE_TTL_MS = 1000 * 60 * 15;

function getBucket(): LineLinkBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasLineLinkStore?: LineLinkBucket;
  };
  if (!scope.__atlasLineLinkStore) {
    scope.__atlasLineLinkStore = {
      byAtlasUserId: new Map(),
      byLineUserId: new Map(),
      codes: new Map(),
    };
  }
  return scope.__atlasLineLinkStore;
}

function purgeExpiredCodes(bucket: LineLinkBucket): void {
  const now = Date.now();
  for (const [code, entry] of bucket.codes.entries()) {
    if (entry.expiresAt < now) bucket.codes.delete(code);
  }
}

export function createLineLinkCode(atlasUserId: string): LineLinkCode {
  const bucket = getBucket();
  purgeExpiredCodes(bucket);

  // Remove previous codes for this user
  for (const [code, entry] of bucket.codes.entries()) {
    if (entry.atlasUserId === atlasUserId) bucket.codes.delete(code);
  }

  const code = String(randomInt(100000, 999999));
  const entry: LineLinkCode = {
    code,
    atlasUserId,
    createdAt: Date.now(),
    expiresAt: Date.now() + CODE_TTL_MS,
  };
  bucket.codes.set(code, entry);
  return entry;
}

export function consumeLineLinkCode(code: string): LineLinkCode | null {
  const bucket = getBucket();
  purgeExpiredCodes(bucket);
  const normalized = code.trim();
  const entry = bucket.codes.get(normalized);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    bucket.codes.delete(normalized);
    return null;
  }
  bucket.codes.delete(normalized);
  return entry;
}

export function saveLineUserLink(link: LineUserLink): LineUserLink {
  const bucket = getBucket();
  const previous = bucket.byAtlasUserId.get(link.atlasUserId);
  if (previous) {
    bucket.byLineUserId.delete(previous.lineUserId);
  }
  bucket.byAtlasUserId.set(link.atlasUserId, link);
  bucket.byLineUserId.set(link.lineUserId, link);
  return link;
}

export function getLineLinkByAtlasUserId(
  atlasUserId: string,
): LineUserLink | null {
  return getBucket().byAtlasUserId.get(atlasUserId) ?? null;
}

export function getLineLinkByLineUserId(lineUserId: string): LineUserLink | null {
  return getBucket().byLineUserId.get(lineUserId) ?? null;
}

export function unlinkLineUser(atlasUserId: string): boolean {
  const bucket = getBucket();
  const existing = bucket.byAtlasUserId.get(atlasUserId);
  if (!existing) return false;
  bucket.byAtlasUserId.delete(atlasUserId);
  bucket.byLineUserId.delete(existing.lineUserId);
  return true;
}

export function resetLineLinkStore(): void {
  const bucket = getBucket();
  bucket.byAtlasUserId.clear();
  bucket.byLineUserId.clear();
  bucket.codes.clear();
}
