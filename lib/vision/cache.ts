import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { VisionAnalysisResult, VisionDetailLevel } from "@/lib/vision/types";
import { bumpPersistenceCounter } from "@/lib/persistence/call-counters";
import { allowProcessCwdDataDir } from "@/lib/runtime/ephemeral-fs";

function cacheRoot(): string {
  return path.join(process.cwd(), ".data", "vision-cache");
}

function cacheKey(contentHash: string, detail: VisionDetailLevel, promptVersion: string): string {
  return createHash("sha256")
    .update(`${contentHash}|${detail}|${promptVersion}`)
    .digest("hex")
    .slice(0, 40);
}

function cachePath(userId: string, key: string): string {
  return path.join(cacheRoot(), userId, `${key}.json`);
}

type MemoryVisionCache = Map<string, VisionAnalysisResult>;

function memoryCache(): MemoryVisionCache {
  const g = globalThis as typeof globalThis & {
    __atlasVisionAnalysisCache?: MemoryVisionCache;
  };
  if (!g.__atlasVisionAnalysisCache) g.__atlasVisionAnalysisCache = new Map();
  return g.__atlasVisionAnalysisCache;
}

function memKey(
  userId: string,
  contentHash: string,
  detail: VisionDetailLevel,
  promptVersion: string,
): string {
  return `${userId}:${cacheKey(contentHash, detail, promptVersion)}`;
}

export async function getCachedVisionAnalysis(args: {
  userId: string;
  contentHash: string;
  detail: VisionDetailLevel;
  promptVersion: string;
}): Promise<VisionAnalysisResult | null> {
  const key = memKey(args.userId, args.contentHash, args.detail, args.promptVersion);
  const fromMem = memoryCache().get(key);
  if (fromMem) return fromMem;

  if (!allowProcessCwdDataDir()) return null;

  try {
    const file = cachePath(
      args.userId,
      cacheKey(args.contentHash, args.detail, args.promptVersion),
    );
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as VisionAnalysisResult;
  } catch {
    return null;
  }
}

export async function setCachedVisionAnalysis(args: {
  userId: string;
  contentHash: string;
  detail: VisionDetailLevel;
  promptVersion: string;
  result: VisionAnalysisResult;
}): Promise<void> {
  const key = memKey(args.userId, args.contentHash, args.detail, args.promptVersion);
  memoryCache().set(key, args.result);

  if (!allowProcessCwdDataDir()) {
    bumpPersistenceCounter("processCwdDataDirBlocked");
    return;
  }

  bumpPersistenceCounter("processCwdDataDirAttempts");
  const file = cachePath(
    args.userId,
    cacheKey(args.contentHash, args.detail, args.promptVersion),
  );
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(args.result), "utf8");
}
