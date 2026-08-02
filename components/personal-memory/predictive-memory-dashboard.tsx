"use client";

import type { PredictiveMemoryDashboard } from "@/lib/personal-memory/predict/types";
import {
  acceptProactiveSuggestionClient,
  dismissProactiveSuggestionClient,
} from "@/lib/personal-memory/client";
import { Button } from "@/components/ui/button";
import { useTransition } from "react";

function pct(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function PredictiveMemoryDashboardPanel({
  dashboard,
  onRefresh,
}: {
  dashboard: PredictiveMemoryDashboard | null;
  onRefresh?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  if (!dashboard) {
    return (
      <section className="rounded-2xl border border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
        Prediction の履歴がまだありません。成果物作成前に先回り適用が記録されます。
      </section>
    );
  }

  const k = dashboard.kpis;

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-2xl border border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold">Prediction Score</h2>
        <p className="text-3xl font-semibold tracking-tight text-[var(--brand)]">
          {dashboard.overallPredictionScore?.label ?? "計測前"}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          成功率 {pct(dashboard.predictionSuccessRate)} · 予測{" "}
          {k.predictionsCount} 件
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Prediction Accuracy" value={pct(k.predictionAccuracy)} />
        <Kpi label="Memory Accuracy" value={pct(k.memoryAccuracy)} />
        <Kpi label="Diff Reduction" value={pct(k.diffReduction)} />
        <Kpi label="Instruction Reduction" value={pct(k.instructionReduction)} />
        <Kpi label="Reuse Rate" value={pct(k.reuseRate)} />
        <Kpi label="First Accept Rate" value={pct(k.firstAcceptRate)} />
        <Kpi
          label="Automation Suggestion Rate"
          value={pct(k.automationSuggestionRate)}
        />
      </section>

      {dashboard.proactiveSuggestions.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">Automation / 先回り提案</h2>
          <ul className="space-y-3">
            {dashboard.proactiveSuggestions.map((s) => (
              <li key={s.id} className="space-y-2 text-sm">
                <p className="font-medium">{s.title}</p>
                <p className="text-[var(--text-secondary)]">{s.description}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await acceptProactiveSuggestionClient(s.fingerprint);
                        onRefresh?.();
                      })
                    }
                  >
                    はい
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await dismissProactiveSuggestionClient(s.fingerprint);
                        onRefresh?.();
                      })
                    }
                  >
                    いいえ
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dashboard.recentApplied.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">最近適用した Memory</h2>
          <ul className="space-y-2 text-sm">
            {dashboard.recentApplied.map((row) => (
              <li key={row.id}>
                {row.title} — {row.summary}
                <span className="ml-2 text-[10px] text-[var(--text-muted)]">
                  Prediction {row.predictionScore}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dashboard.recentRejected.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">最近断られた Memory</h2>
          <ul className="space-y-2 text-sm">
            {dashboard.recentRejected.map((row) => (
              <li key={row.id}>
                {row.title} — {row.summary}
                <span className="ml-2 text-[10px] text-[var(--text-muted)]">
                  {row.outcome}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dashboard.history.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">Prediction 履歴</h2>
          <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
            {dashboard.history.slice(0, 12).map((row) => (
              <li key={row.id}>
                {new Date(row.createdAt).toLocaleString("ja-JP")} · {row.title}{" "}
                · {row.predictionScore}% · {row.outcome}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--surface-muted)] px-3 py-3">
      <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}
