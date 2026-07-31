import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type NpsResponse = {
  id: string;
  score: number;
  createdAt: string;
  cohort?: string;
};

type NpsFile = {
  responses: NpsResponse[];
};

function dataDir(): string {
  return process.env.LAUNCH_VERDICT_DATA_DIR
    ? path.resolve(process.env.LAUNCH_VERDICT_DATA_DIR)
    : path.join(process.cwd(), ".data", "launch-verdict");
}

function filePath(): string {
  return path.join(dataDir(), "nps.json");
}

function ensure(): void {
  const dir = dataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(filePath())) {
    writeFileSync(filePath(), JSON.stringify({ responses: [] }, null, 2), "utf8");
  }
}

function read(): NpsFile {
  ensure();
  try {
    const raw = readFileSync(filePath(), "utf8");
    const parsed = JSON.parse(raw) as NpsFile;
    return { responses: Array.isArray(parsed.responses) ? parsed.responses : [] };
  } catch {
    return { responses: [] };
  }
}

function write(file: NpsFile): void {
  ensure();
  writeFileSync(filePath(), JSON.stringify(file, null, 2), "utf8");
}

/** NPS = %Promoters(9–10) − %Detractors(0–6). Passives 7–8 ignored in score. */
export function computeNps(scores: number[]): { nps: number | null; sampleSize: number } {
  if (scores.length === 0) {
    return { nps: null, sampleSize: 0 };
  }
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  const n = scores.length;
  const nps = ((promoters - detractors) / n) * 100;
  return { nps: Math.round(nps * 10) / 10, sampleSize: n };
}

export function listNpsResponses(): NpsResponse[] {
  return read().responses;
}

export function getNpsSnapshot(): { nps: number | null; sampleSize: number } {
  const scores = listNpsResponses().map((r) => r.score);
  return computeNps(scores);
}

export function recordNpsResponse(input: {
  score: number;
  cohort?: string;
}): NpsResponse {
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 10) {
    throw new Error("NPS score must be an integer 0–10");
  }
  const file = read();
  const row: NpsResponse = {
    id: `nps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    score: input.score,
    createdAt: new Date().toISOString(),
    cohort: input.cohort,
  };
  file.responses.push(row);
  write(file);
  return row;
}

export function resetNpsStoreForTests(): void {
  write({ responses: [] });
}
