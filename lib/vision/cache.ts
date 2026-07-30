import { createHash } from "crypto";
import type { VisionAnalysisResult, VisionDetailLevel } from "@/lib/vision/types";

function cacheKey(contentHash: string, detail: VisionDetailLevel, promptVersion: string): string {
  return createHash("sha256")
    .update(`${contentHash}|${detail}|${promptVersion}`)
    .digest("hex")
    .slice(0, 40);
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
  return memoryCache().get(key) ?? null;
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
}
