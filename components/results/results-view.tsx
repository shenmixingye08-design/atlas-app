"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ProjectDetailView } from "@/components/projects/project-detail-view";
import { SecretaryResultView } from "@/components/results/secretary-result-view";
import { LoadingState } from "@/components/ui/loading-state";
import { fetchNotificationResult, type NotificationResult } from "@/lib/results/client";
import { readDevResultTarget } from "@/lib/results/dev-preview";

import { ResultErrorNotice } from "./result-error-notice";

type ResultsViewProps = {
  notificationId: string;
};

type ViewState =
  | { phase: "loading" }
  | { phase: "resolved"; result: NotificationResult }
  | { phase: "dev_fallback"; targetId: string };

/**
 * Canonical result view reached by「結果を見る」via `/results/<notificationId>`.
 *
 * Resolves the exact outcome from the notification alone (auth + ownership on
 * the server) and renders the 成果物 directly — never a list to hunt through.
 * Every unresolved case shows an explicit Japanese reason (never blank).
 */
export function ResultsView({ notificationId }: ResultsViewProps) {
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    void fetchNotificationResult(notificationId).then((result) => {
      if (cancelled) return;

      // DEV harness: logged-out dev browsers get 401 / no durable backend.
      // Fall back to the seeded notification→target map + client cache so the
      // REAL route still proves it renders a 成果物 (no-op in production).
      if (result.status === "error" && result.code === "unauthorized") {
        const devTarget = readDevResultTarget(notificationId);
        if (devTarget) {
          setState({ phase: "dev_fallback", targetId: devTarget.targetId });
          return;
        }
      }
      if (result.status === "unavailable") {
        setState({ phase: "dev_fallback", targetId: result.targetId });
        return;
      }

      setState({ phase: "resolved", result });
    });

    return () => {
      cancelled = true;
    };
  }, [notificationId]);

  // Non-deliverable outcomes resolve to their existing working detail view.
  useEffect(() => {
    if (state.phase === "resolved" && state.result.status === "redirect") {
      router.replace(state.result.url);
    }
  }, [state, router]);

  const backLink = (
    <Link
      href="/notifications"
      className="inline-flex items-center gap-1 text-sm text-[var(--foreground-muted)] transition-colors hover:text-foreground focus-ring rounded"
    >
      ← 通知一覧
    </Link>
  );

  if (state.phase === "loading") {
    return <LoadingState />;
  }

  if (state.phase === "dev_fallback") {
    // Reuse the full project detail resolution (client cache + durable fetch +
    // every never-blank state) keyed by the resolved target id.
    return <ProjectDetailView projectId={state.targetId} />;
  }

  const { result } = state;

  if (result.status === "deliverable") {
    return (
      <SecretaryResultView
        project={result.project}
        backHref="/notifications"
        backLabel="通知一覧"
      />
    );
  }

  if (result.status === "redirect") {
    return <LoadingState />;
  }

  if (result.status === "unavailable") {
    // No durable backend — resolve from the client cache by id.
    return <ProjectDetailView projectId={result.targetId} />;
  }

  return (
    <div className="space-y-8">
      {backLink}
      <ResultErrorNotice code={result.code} />
    </div>
  );
}
