import type {
  BetaFeedbackRecord,
  BetaMetricsSnapshot,
  BetaSessionRecord,
  DropoutReason,
  PayIntent,
  RateWithN,
} from "./types";

function rate(success: number, total: number): RateWithN {
  return {
    success,
    total,
    rate: total > 0 ? success / total : null,
    definitive: total >= 10,
  };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx]!;
}

export function computeBetaMetrics(
  sessions: BetaSessionRecord[],
  feedback: BetaFeedbackRecord[]
): BetaMetricsSnapshot {
  const testers = new Set(sessions.map((s) => s.anonymousUserId));
  const firstByUser = new Map<string, BetaSessionRecord>();
  for (const s of [...sessions].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)
  )) {
    if (!firstByUser.has(s.anonymousUserId)) {
      firstByUser.set(s.anonymousUserId, s);
    }
  }
  const firstSessions = [...firstByUser.values()];

  const completed = firstSessions.filter((s) => s.completed);
  const downloaded = firstSessions.filter((s) => s.downloaded);
  // signup/submit proxies: session started ≈ registered+entered; submitted if requestId
  const submitted = firstSessions.filter((s) => Boolean(s.requestId));

  const durations = completed
    .map((s) => s.durationMs)
    .filter((n): n is number => typeof n === "number" && n >= 0)
    .sort((a, b) => a - b);

  const byFlow: Record<string, RateWithN> = {};
  for (const flow of new Set(sessions.map((s) => s.flowId))) {
    const rows = sessions.filter((s) => s.flowId === flow);
    byFlow[flow] = rate(
      rows.filter((s) => s.completed).length,
      rows.length
    );
  }

  const byDevice: Record<string, RateWithN> = {};
  for (const device of new Set(sessions.map((s) => s.deviceType))) {
    const rows = sessions.filter((s) => s.deviceType === device);
    byDevice[device] = rate(
      rows.filter((s) => s.completed).length,
      rows.length
    );
  }

  const screenMap = new Map<string, number>();
  const reasonMap = new Map<DropoutReason, number>();
  for (const s of sessions) {
    if (!s.completed && s.stuckScreen) {
      screenMap.set(s.stuckScreen, (screenMap.get(s.stuckScreen) ?? 0) + 1);
    }
    if (!s.completed && s.dropoutReason) {
      reasonMap.set(
        s.dropoutReason,
        (reasonMap.get(s.dropoutReason) ?? 0) + 1
      );
    }
  }

  const payIntent: Record<PayIntent, number> = {
    definitely: 0,
    probably: 0,
    neutral: 0,
    probably_not: 0,
    no: 0,
  };
  for (const f of feedback) {
    if (f.payIntent980) payIntent[f.payIntent980] += 1;
  }

  // 7d reuse: same anonymousUserId with 2+ sessions ≥1 day apart — only if data exists
  let reuseSuccess = 0;
  for (const uid of testers) {
    const userSessions = sessions
      .filter((s) => s.anonymousUserId === uid)
      .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
    if (userSessions.length < 2) continue;
    const first = Date.parse(userSessions[0]!.startedAt);
    const later = userSessions.some(
      (s) =>
        Date.parse(s.startedAt) - first >= 24 * 60 * 60 * 1000 &&
        Date.parse(s.startedAt) - first <= 7 * 24 * 60 * 60 * 1000
    );
    if (later) reuseSuccess += 1;
  }

  return {
    testerCount: testers.size,
    sessions: sessions.length,
    signupCompleted: rate(testers.size, testers.size),
    firstRequestSubmit: rate(submitted.length, firstSessions.length),
    firstArtifactComplete: rate(completed.length, firstSessions.length),
    firstDownload: rate(downloaded.length, firstSessions.length),
    firstFlowComplete: rate(completed.length, firstSessions.length),
    reuse7d: rate(reuseSuccess, testers.size),
    durationMs: {
      avg:
        durations.length > 0
          ? Math.round(
              durations.reduce((a, b) => a + b, 0) / durations.length
            )
          : null,
      median: percentile(durations, 50),
      p90: percentile(durations, 90),
      p95: percentile(durations, 95),
      n: durations.length,
    },
    byFlow,
    byDevice,
    dropoutScreens: [...screenMap.entries()]
      .map(([screen, count]) => ({ screen, count }))
      .sort((a, b) => b.count - a.count),
    dropoutReasons: [...reasonMap.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    payIntent,
    generatedAt: new Date().toISOString(),
  };
}

export function evaluateGateTargets(m: BetaMetricsSnapshot): {
  pass: boolean;
  failures: string[];
} {
  const failures: string[] = [];
  if (m.testerCount < 10) {
    failures.push(`testerCount ${m.testerCount} < 10 (非確定・不合格)`);
  }
  const check = (label: string, r: RateWithN, min: number) => {
    if (!r.definitive) {
      failures.push(`${label}: n=${r.total} < 10（確定評価不可）`);
      return;
    }
    if (r.rate == null || r.rate < min) {
      failures.push(
        `${label}: ${((r.rate ?? 0) * 100).toFixed(1)}% < ${min * 100}% (n=${r.total})`
      );
    }
  };
  check("初回依頼送信率", m.firstRequestSubmit, 0.85);
  check("初回成果物完成率", m.firstArtifactComplete, 0.8);
  check("初回ダウンロード率", m.firstDownload, 0.7);
  check("初回完遂率", m.firstFlowComplete, 0.75);
  if (m.durationMs.n >= 10 && (m.durationMs.median ?? Infinity) > 5 * 60_000) {
    failures.push(
      `初回完成中央値 ${m.durationMs.median}ms > 5分 (n=${m.durationMs.n})`
    );
  }
  return { pass: failures.length === 0, failures };
}
