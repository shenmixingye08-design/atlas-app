import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import type { EvidenceSuiteSummary } from "@/lib/quality-assurance/types";

const DEFAULT_DIR =
  process.env.QUALITY_EVIDENCE_DIR ??
  "/opt/cursor/artifacts/quality-assurance";

type StoreState = {
  latest: EvidenceSuiteSummary | null;
  history: EvidenceSuiteSummary[];
};

function getMemory(): StoreState {
  const g = globalThis as typeof globalThis & {
    __atlasQualityEvidence?: StoreState;
  };
  if (!g.__atlasQualityEvidence) {
    g.__atlasQualityEvidence = { latest: null, history: [] };
  }
  return g.__atlasQualityEvidence;
}

export function getEvidenceDir(): string {
  return DEFAULT_DIR;
}

export function ensureEvidenceDir(subdir?: string): string {
  const dir = subdir ? join(DEFAULT_DIR, subdir) : DEFAULT_DIR;
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveEvidenceSuite(summary: EvidenceSuiteSummary): string {
  const dir = ensureEvidenceDir(summary.suiteId);
  const reportPath = join(dir, "suite-summary.json");
  const withPath = { ...summary, reportPath };
  writeFileSync(reportPath, JSON.stringify(withPath, null, 2), "utf8");

  const latestPath = join(DEFAULT_DIR, "latest-suite.json");
  writeFileSync(latestPath, JSON.stringify(withPath, null, 2), "utf8");

  const mem = getMemory();
  mem.latest = withPath;
  mem.history = [withPath, ...mem.history].slice(0, 20);

  return reportPath;
}

export function loadLatestEvidenceSuite(): EvidenceSuiteSummary | null {
  const mem = getMemory();
  if (mem.latest) return mem.latest;

  const latestPath = join(DEFAULT_DIR, "latest-suite.json");
  if (!existsSync(latestPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(latestPath, "utf8")) as EvidenceSuiteSummary;
    mem.latest = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function resetEvidenceStoreForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasQualityEvidence?: StoreState;
  };
  g.__atlasQualityEvidence = { latest: null, history: [] };
}
