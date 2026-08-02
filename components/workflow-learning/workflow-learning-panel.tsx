"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import { PageHeader, SectionHeader } from "@/components/automation-first/page-header";
import { EmptyState } from "@/components/automation-first/empty-state";
import { ErrorState } from "@/components/automation-first/error-state";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { useFeatureAvailability } from "@/lib/feature-flags";
import {
  analyzeWorkflowLearning,
  applyWorkflowCandidate,
  approveWorkflowCandidate,
  fetchWorkflowLearningCandidates,
  rejectWorkflowCandidate,
  rollbackWorkflowRevision,
} from "@/lib/workflow-learning/client";
import type { WorkflowLearningCandidate } from "@/lib/workflow-learning/types";
import { cn } from "@/lib/design-system/cn";

type Tab = "candidate" | "applied" | "rejected" | "trial" | "rolled_back";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "candidate", label: "改善候補" },
  { id: "trial", label: "Trial中" },
  { id: "applied", label: "適用済み" },
  { id: "rejected", label: "見送った" },
  { id: "rolled_back", label: "Rollback済み" },
];

function RiskBadge({ level }: { level: WorkflowLearningCandidate["riskLevel"] }) {
  const label =
    level === "high" ? "高リスク" : level === "medium" ? "注意" : "低リスク";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        level === "high" && "bg-[var(--error-bg)] text-[var(--error)]",
        level === "medium" && "bg-[var(--warning-bg)] text-[var(--warning)]",
        level === "low" && "bg-[var(--success-bg)] text-[var(--success)]",
      )}
    >
      {label}
    </span>
  );
}

function CandidateCard({
  candidate,
  busy,
  onApprove,
  onReject,
  onSuppress,
  onApply,
  onTrial,
  onRollback,
}: {
  candidate: WorkflowLearningCandidate;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onSuppress: () => void;
  onApply: (allowHighRisk: boolean) => void;
  onTrial: () => void;
  onRollback: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const benefit = candidate.expectedBenefit;

  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <RiskBadge level={candidate.riskLevel} />
            <span className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
              信頼度 {Math.round(candidate.confidence * 100)}%
            </span>
            {candidate.deferToMemory ? (
              <span className="text-[length:var(--text-meta)] text-[var(--brand)]">
                好みの記憶向け
              </span>
            ) : null}
          </div>
          <h3 className="text-[length:var(--text-card-title)] font-semibold text-[var(--text-primary)]">
            {candidate.summary}
          </h3>
          <p className="text-[length:var(--text-caption)] text-[var(--text-secondary)]">
            {candidate.reason}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[length:var(--text-caption)] sm:grid-cols-4">
        <div>
          <dt className="text-[var(--text-muted)]">手直し削減</dt>
          <dd className="font-medium tabular-nums">
            {Math.round(benefit.manualStepReduction * 100)}%
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">失敗削減</dt>
          <dd className="font-medium tabular-nums">
            {Math.round(benefit.failureReduction * 100)}%
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">時間</dt>
          <dd className="font-medium tabular-nums">
            {Math.round(benefit.timeReduction * 100)}%
          </dd>
        </div>
        <div>
          <dt className="text-[var(--text-muted)]">コスト</dt>
          <dd className="font-medium tabular-nums">
            {Math.round(benefit.costReduction * 100)}%
          </dd>
        </div>
      </dl>

      <button
        type="button"
        className="mt-3 text-sm font-medium text-[var(--brand)] underline-offset-2 hover:underline"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "詳細を閉じる" : "詳細を見る"}
      </button>

      {expanded ? (
        <div className="mt-3 space-y-2 rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 text-[length:var(--text-caption)]">
          <p className="font-medium text-[var(--text-primary)]">根拠</p>
          <ul className="list-disc space-y-1 pl-5 text-[var(--text-secondary)]">
            {candidate.evidence.map((e, i) => (
              <li key={`${e.kind}-${i}`}>
                {e.label}
                {e.runId ? `（Run: ${e.runId.slice(0, 8)}…）` : null}
              </li>
            ))}
          </ul>
          <p className="font-medium text-[var(--text-primary)]">変更内容</p>
          <pre className="overflow-x-auto whitespace-pre-wrap text-[var(--text-secondary)]">
            {JSON.stringify(candidate.proposedPatch, null, 2)}
          </pre>
          <p className="text-[var(--text-muted)]">
            適用時は新しいrevisionを作成し、いつでも元に戻せます。実行中のRunには影響しません。
          </p>
          {candidate.deferToMemory ? (
            <p>
              この内容は「好み」に近いため、
              <Link href="/settings/memory" className="text-[var(--brand)] underline">
                記憶
              </Link>
              への保存も検討してください。
            </p>
          ) : null}
        </div>
      ) : null}

      {candidate.status === "candidate" || candidate.status === "approved" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {candidate.status === "candidate" ? (
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[var(--touch-target)]"
              disabled={busy}
              onClick={onApprove}
            >
              承認する
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            className="min-h-[var(--touch-target)]"
            disabled={busy}
            onClick={() => onApply(candidate.riskLevel === "high")}
          >
            この自動化へ適用
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[var(--touch-target)]"
            disabled={busy}
            onClick={onTrial}
          >
            一回だけ試す
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[var(--touch-target)]"
            disabled={busy}
            onClick={onReject}
          >
            今回は見送る
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-[var(--touch-target)]"
            disabled={busy}
            onClick={onSuppress}
          >
            今後提案しない
          </Button>
        </div>
      ) : null}

      {(candidate.status === "applied" || candidate.status === "trial") &&
      candidate.appliedRevisionId ? (
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[var(--touch-target)]"
            disabled={busy}
            onClick={onRollback}
          >
            直前のrevisionへ戻す
          </Button>
        </div>
      ) : null}
    </article>
  );
}

export function WorkflowLearningPanel({
  automationId,
}: {
  automationId?: string;
}) {
  const { flags, loading: flagsLoading } = useFeatureAvailability();
  const enabled = !flagsLoading && flags.workflow_learning_enabled === true;
  const [tab, setTab] = useState<Tab>("candidate");
  const [candidates, setCandidates] = useState<WorkflowLearningCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [analyzeId, setAnalyzeId] = useState(automationId ?? "");

  const reload = useCallback(async () => {
    setError(null);
    const payload = await fetchWorkflowLearningCandidates({
      automationId: automationId || undefined,
      status: "all",
    });
    setCandidates(payload.candidates);
  }, [automationId]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void reload()
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, reload]);

  const visible = useMemo(
    () => candidates.filter((c) => c.status === tab),
    [candidates, tab],
  );

  if (flagsLoading || loading) {
    return <LoadingState message="改善候補を読み込んでいます…" />;
  }

  if (!enabled) {
    return (
      <EmptyState
        title="改善提案は現在オフです"
        description="Owner の Feature Flag「Workflow Learning」をオンにすると、実行結果からの改善候補を確認できます。"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="MINERVOT"
        title="改善提案"
        description="実行結果と繰り返しの修正から候補を作ります。承認するまで自動化は変わりません。"
      />

      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
        <SectionHeader
          title="この自動化を分析"
          description="失敗パターン・修正の繰り返し・コストを確認します"
        />
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="min-h-[var(--touch-target)] flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            placeholder="自動化ID"
            value={analyzeId}
            onChange={(e) => setAnalyzeId(e.target.value)}
          />
          <Button
            variant="primary"
            className="min-h-[var(--touch-target)]"
            disabled={pending || !analyzeId.trim()}
            onClick={() => {
              startTransition(async () => {
                try {
                  const result = await analyzeWorkflowLearning(analyzeId.trim());
                  setCandidates((prev) => {
                    const others = prev.filter(
                      (c) => c.automationId !== analyzeId.trim(),
                    );
                    return [...result.candidates, ...others];
                  });
                } catch (err) {
                  setError(err instanceof Error ? err.message : "分析に失敗しました");
                }
              });
            }}
          >
            分析する
          </Button>
        </div>
      </section>

      {error ? (
        <ErrorState
          description={error}
          onRetry={() => {
            setError(null);
            void reload().catch((err: Error) => setError(err.message));
          }}
        />
      ) : null}

      <div role="tablist" aria-label="改善候補の状態" className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "inline-flex min-h-[var(--touch-target)] items-center rounded-[var(--radius-md)] px-4 text-sm font-medium",
              tab === item.id
                ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                : "border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-secondary)]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="表示する候補がありません"
          description="自動化を分析するか、同じ修正が繰り返されるとここに候補が出ます。"
          primaryHref="/automations"
          primaryLabel="自動化一覧へ"
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((candidate) => (
            <li key={candidate.id}>
              <CandidateCard
                candidate={candidate}
                busy={pending}
                onApprove={() => {
                  startTransition(async () => {
                    const { candidate: next } = await approveWorkflowCandidate(
                      candidate.id,
                    );
                    setCandidates((prev) =>
                      prev.map((c) => (c.id === next.id ? next : c)),
                    );
                  });
                }}
                onReject={() => {
                  startTransition(async () => {
                    const { candidate: next } = await rejectWorkflowCandidate(
                      candidate.id,
                      false,
                    );
                    setCandidates((prev) =>
                      prev.map((c) => (c.id === next.id ? next : c)),
                    );
                  });
                }}
                onSuppress={() => {
                  startTransition(async () => {
                    const { candidate: next } = await rejectWorkflowCandidate(
                      candidate.id,
                      true,
                    );
                    setCandidates((prev) =>
                      prev.map((c) => (c.id === next.id ? next : c)),
                    );
                  });
                }}
                onApply={(allowHighRisk) => {
                  startTransition(async () => {
                    try {
                      const result = await applyWorkflowCandidate({
                        candidateId: candidate.id,
                        allowHighRiskExternal: allowHighRisk,
                      });
                      setCandidates((prev) =>
                        prev.map((c) =>
                          c.id === result.candidate.id ? result.candidate : c,
                        ),
                      );
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : "適用に失敗しました",
                      );
                    }
                  });
                }}
                onTrial={() => {
                  startTransition(async () => {
                    try {
                      const result = await applyWorkflowCandidate({
                        candidateId: candidate.id,
                        trial: true,
                      });
                      setCandidates((prev) =>
                        prev.map((c) =>
                          c.id === result.candidate.id ? result.candidate : c,
                        ),
                      );
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : "Trialに失敗しました",
                      );
                    }
                  });
                }}
                onRollback={() => {
                  startTransition(async () => {
                    try {
                      // Roll back to parent via applied revision's rollbackTarget is handled server-side
                      // Client sends appliedRevisionId as target of previous — fetch revisions would be ideal;
                      // use appliedRevisionId's parent by asking rollback API with baseline from candidate meta.
                      // For UX simplicity: pass appliedRevisionId and server resolves parent if needed.
                      // Current API expects targetRevisionId = the revision TO restore.
                      // We stored rollbackTarget on the new revision — client doesn't have it.
                      // Workaround: call rollback with appliedRevisionId after fetching revisions.
                      const revsRes = await fetch(
                        `/api/workflow-learning/revisions?automationId=${encodeURIComponent(candidate.automationId)}`,
                      );
                      const revsJson = (await revsRes.json()) as {
                        revisions: Array<{
                          id: string;
                          rollbackTarget: string | null;
                        }>;
                      };
                      const applied = revsJson.revisions.find(
                        (r) => r.id === candidate.appliedRevisionId,
                      );
                      const target =
                        applied?.rollbackTarget ?? revsJson.revisions[1]?.id;
                      if (!target) {
                        setError("戻せるrevisionがありません");
                        return;
                      }
                      await rollbackWorkflowRevision({
                        automationId: candidate.automationId,
                        targetRevisionId: target,
                      });
                      await reload();
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Rollbackに失敗しました",
                      );
                    }
                  });
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
