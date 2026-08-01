import type {
  BetaFeedbackRecord,
  BetaFinding,
  BetaSessionRecord,
} from "./types";

type BetaBucket = {
  sessions: BetaSessionRecord[];
  feedback: BetaFeedbackRecord[];
  findings: BetaFinding[];
};

function getBucket(): BetaBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasBetaUxStore?: BetaBucket;
  };
  if (!scope.__atlasBetaUxStore) {
    scope.__atlasBetaUxStore = {
      sessions: [],
      feedback: [],
      findings: [],
    };
  }
  return scope.__atlasBetaUxStore;
}

export function upsertBetaSession(session: BetaSessionRecord): BetaSessionRecord {
  const bucket = getBucket();
  const idx = bucket.sessions.findIndex((s) => s.sessionId === session.sessionId);
  if (idx >= 0) bucket.sessions[idx] = session;
  else bucket.sessions.unshift(session);
  if (bucket.sessions.length > 5000) bucket.sessions.length = 5000;
  return session;
}

export function listBetaSessions(limit = 500): BetaSessionRecord[] {
  return getBucket().sessions.slice(0, limit);
}

export function getBetaSession(sessionId: string): BetaSessionRecord | null {
  return getBucket().sessions.find((s) => s.sessionId === sessionId) ?? null;
}

export function addBetaFeedback(
  row: BetaFeedbackRecord
): BetaFeedbackRecord {
  const bucket = getBucket();
  bucket.feedback.unshift(row);
  if (bucket.feedback.length > 2000) bucket.feedback.length = 2000;
  return row;
}

export function listBetaFeedback(limit = 500): BetaFeedbackRecord[] {
  return getBucket().feedback.slice(0, limit);
}

export function setBetaFindings(findings: BetaFinding[]): void {
  getBucket().findings = [...findings];
}

export function listBetaFindings(): BetaFinding[] {
  return [...getBucket().findings];
}

export function resetBetaUxStoreForTests(): void {
  const bucket = getBucket();
  bucket.sessions = [];
  bucket.feedback = [];
  bucket.findings = [];
}

export function searchBetaByIds(input: {
  requestId?: string;
  jobId?: string;
  artifactId?: string;
}): BetaSessionRecord[] {
  return getBucket().sessions.filter((s) => {
    if (input.requestId && s.requestId === input.requestId) return true;
    if (input.jobId && s.jobId === input.jobId) return true;
    if (input.artifactId && s.artifactId === input.artifactId) return true;
    return false;
  });
}
