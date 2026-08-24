"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { canStartCheckout } from "@/lib/growth/revenue-max/upgrade";

type Snapshot = {
  lifecycle: string;
  resumeCheckout: boolean;
  upgrade: {
    show: boolean;
    trigger: string | null;
    currentPlanName: string;
    recommendedPlanId: string | null;
    recommendedPlanName: string | null;
    recommendedPriceJpy: number | null;
    priceIdReady: boolean;
    reason: string | null;
    addedFeatures: string[];
    billingCycle: string;
    cancelPolicy: string;
  };
  remainingAi: { used: number; limit: number; remaining: number } | null;
  measured: {
    completedJobs: number | null;
    automationSuccesses: number | null;
    deliverables: number | null;
    xPosts: number | null;
    usageThisMonth: number | null;
    activeAutomations: number | null;
    previousMonthJobs: number | null;
  };
  state: {
    lastSuccessSummary: string | null;
    lastFailMessage: string | null;
    firstSuccessAt: string | null;
  };
};

function measuredLabel(value: number | null): string {
  return value == null ? "未取得" : String(value);
}

async function postAction(action: string, extra: Record<string, unknown> = {}) {
  await fetch("/api/growth/revenue-max", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ action, ...extra }),
  });
}

export function RevenueMaxBanners() {
  const { isSignedIn } = useUser();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!isSignedIn || loaded.current) return;
    loaded.current = true;
    void fetch("/api/growth/revenue-max", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as Snapshot;
        setSnapshot({
          ...body,
          measured: body.measured ?? {
            completedJobs: null,
            automationSuccesses: null,
            deliverables: null,
            xPosts: null,
            usageThisMonth: null,
            activeAutomations: null,
            previousMonthJobs: null,
          },
        });
      })
      .catch(() => {
        loaded.current = false;
      });
  }, [isSignedIn]);

  if (!snapshot) return null;

  return (
    <div className="space-y-3 px-4 pt-3">
      {snapshot.state.lastFailMessage ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--error-bg)] px-3 py-2 text-sm">
          初回の仕事が完了しませんでした。{snapshot.state.lastFailMessage}
          同じ依頼をもう一度試せます。
        </div>
      ) : null}

      {snapshot.state.firstSuccessAt ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-sm">
          <p className="font-medium">あなたの実績（実測のみ）</p>
          <ul className="mt-1 space-y-0.5 text-xs text-[var(--text-muted)]">
            <li>今月のAI利用: {measuredLabel(snapshot.measured.usageThisMonth)}</li>
            <li>外部投稿成功: {measuredLabel(snapshot.measured.xPosts)}</li>
            <li>継続中の自動化: {measuredLabel(snapshot.measured.activeAutomations)}</li>
            <li>完了した依頼: {measuredLabel(snapshot.measured.completedJobs)}</li>
            <li>前月のAI利用: {measuredLabel(snapshot.measured.previousMonthJobs)}</li>
          </ul>
        </div>
      ) : null}

      {snapshot.lifecycle === "paid_at_risk" ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-sm">
          <p className="font-medium">最近、完了した仕事がありません。</p>
          <p className="mt-1">
            最後の成果: {snapshot.state.lastSuccessSummary ?? "未取得"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/projects">
              <Button
                size="sm"
                onClick={() => void postAction("at_risk_shown")}
              >
                もう一度実行する
              </Button>
            </Link>
            <Link href="/automations">
              <Button size="sm" variant="secondary">
                自動化を確認
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="sm" variant="ghost">
                サポート
              </Button>
            </Link>
          </div>
        </div>
      ) : null}

      {snapshot.resumeCheckout ? (
        <div className="rounded-lg border border-[var(--border)] px-3 py-3 text-sm">
          <p>前回の Checkout は完了していません。再開できます。</p>
          <div className="mt-2 flex gap-2">
            <Link href="/settings/billing">
              <Button
                size="sm"
                onClick={() => void postAction("resume_shown")}
              >
                支払い画面を開く
              </Button>
            </Link>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void postAction("resume_shown");
                setSnapshot({ ...snapshot, resumeCheckout: false });
              }}
            >
              後で判断する
            </Button>
          </div>
        </div>
      ) : null}

      {snapshot.upgrade.show ? (
        <div className="rounded-lg border border-[var(--border)] px-3 py-3 text-sm">
          <p className="font-medium">
            現在 {snapshot.upgrade.currentPlanName}
            {snapshot.upgrade.reason ? ` · ${snapshot.upgrade.reason}` : ""}
          </p>
          <p className="mt-1">
            推奨: {snapshot.upgrade.recommendedPlanName ?? "—"}{" "}
            {snapshot.upgrade.recommendedPriceJpy != null
              ? `月額${snapshot.upgrade.recommendedPriceJpy.toLocaleString("ja-JP")}円`
              : ""}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {snapshot.upgrade.billingCycle} · {snapshot.upgrade.cancelPolicy}
          </p>
          {snapshot.remainingAi ? (
            <p className="text-xs text-[var(--text-muted)]">
              到達した上限: AI {snapshot.remainingAi.used} / {snapshot.remainingAi.limit}
            </p>
          ) : null}
          <ul className="mt-1 list-disc pl-5 text-xs">
            {snapshot.upgrade.addedFeatures.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            {canStartCheckout(snapshot.upgrade) ? (
              <Link href="/settings/billing">
                <Button
                  size="sm"
                  onClick={() =>
                    void postAction("upgrade_viewed", {
                      planId: snapshot.upgrade.recommendedPlanId,
                    })
                  }
                >
                  Checkoutへ
                </Button>
              </Link>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                Price ID を確認できないため Checkout を開始しません。
              </p>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void postAction("upgrade_dismissed");
                setSnapshot({
                  ...snapshot,
                  upgrade: { ...snapshot.upgrade, show: false },
                });
              }}
            >
              後で判断する
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
