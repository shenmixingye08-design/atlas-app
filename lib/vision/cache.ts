import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { VisionAnalysisResult, VisionDetailLevel } from "@/lib/vision/types";

function cacheRoot(): string {
  // Resolve at call time so tests that chdir() into a temp data root stay isolated.
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

export async function getCachedVisionAnalysis(args: {
  userId: string;
  contentHash: string;
  detail: VisionDetailLevel;
  promptVersion: string;
}): Promise<VisionAnalysisResult | null> {
  try {
    const key = cacheKey(args.contentHash, args.detail, args.promptVersion);
    const file = cachePath(args.userId, key);
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
  const key = cacheKey(args.contentHash, args.detail, args.promptVersion);
  const file = cachePath(args.userId, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(args.result), "utf8");
}
