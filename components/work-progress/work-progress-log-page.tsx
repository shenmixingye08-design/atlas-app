"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { WorkExecutionLog } from "@/components/work-progress/work-execution-log";
import { WorkProgressTracker } from "@/components/work-progress/work-progress-tracker";
import { Card } from "@/components/ui/card";
import { ui } from "@/lib/i18n";
import { buildStageViews, type WorkProgressStageId } from "@/lib/work-progress/stages";

type Snapshot = {
  runId: string;
  assignment: string;
  status: string;
  stage: WorkProgressStageId;
  etaLabel: string;
  updatedAt: string;
  logs: Array<{
    id: string;
    at: string;
    message: string;
    level: "info" | "warn" | "error";
  }>;
};

/**
 * Dedicated log screen: "AIが何をしているか" for recent / active jobs.
 */
export function WorkProgressLogPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/work-progress", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("進捗を取得できませんでした");
        }
        const data = (await response.json()) as { snapshots?: Snapshot[] };
        if (!cancelled) setSnapshots(data.snapshots ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "読み込みに失敗しました");
        }
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const active = snapshots[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <p className="text-sm font-medium tracking-wide text-accent">MINERVOT</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {ui.workProgress.logHeading}
        </h1>
        <p className="text-sm text-[var(--foreground-muted)]">
          {ui.workProgress.logSubtitle}
        </p>
      </div>

      {error ? (
        <Card padding="lg">
          <p className="text-sm text-foreground">{error}</p>
        </Card>
      ) : null}

      {active ? (
        <>
          <WorkProgressTracker
            stages={buildStageViews({
              current: active.stage,
              failed: active.status === "failed",
            })}
            etaLabel={active.etaLabel}
            assignment={active.assignment}
          />
          <WorkExecutionLog logs={active.logs} />
        </>
      ) : (
        <Card padding="lg" className="space-y-3">
          <p className="text-sm text-[var(--foreground-muted)]">
            {ui.workProgress.logEmpty}
          </p>
          <Link
            href="/workspace"
            className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {ui.nav.newRequest}
          </Link>
        </Card>
      )}

      {snapshots.length > 1 ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">最近の仕事</h2>
          <ul className="space-y-3">
            {snapshots.slice(1).map((snap) => (
              <li key={snap.runId}>
                <Card padding="md" className="space-y-1">
                  <p className="text-sm font-medium text-foreground line-clamp-2">
                    {snap.assignment || snap.runId}
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {snap.status} · {snap.etaLabel}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
