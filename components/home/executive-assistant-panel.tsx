"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import {
  buildExecutiveDashboard,
  dismissExecutiveProposal,
  loadExecutiveAssistantSettings,
  SECRETARY_MODE_LABELS,
  snoozeExecutiveProposal,
  updateSecretaryMode,
  type ExecutiveDashboard,
  type ExecutiveProposal,
  type SecretaryMode,
} from "@/lib/executive-assistant";
import { loadUserWorkProfile } from "@/lib/user-profile/store";
import { cn } from "@/lib/design-system/cn";

type ExecutiveAssistantPanelProps = {
  automations: Automation[];
  projects: Project[];
  /** Compact for secretary home under chat */
  compact?: boolean;
};

function ProposalCard({
  proposal,
  onDismiss,
  onSnooze,
}: {
  proposal: ExecutiveProposal;
  onDismiss: (key: string) => void;
  onSnooze: (key: string) => void;
}) {
  return (
    <article className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{proposal.title}</h3>
        <span className="shrink-0 text-xs text-[var(--muted)]">
          {proposal.automationScore}%
        </span>
      </div>
      <p className="text-sm text-[var(--foreground-muted)]">{proposal.message}</p>
      <p className="text-xs text-[var(--muted)]">{proposal.reason}</p>
      {proposal.memoryChain && proposal.memoryChain.length > 0 ? (
        <p className="text-xs text-[var(--muted)]">
          {proposal.memoryChain.join(" → ")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href={proposal.actionHref}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
        >
          {proposal.actionLabel}
        </Link>
        {proposal.dismissible ? (
          <>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] underline"
              onClick={() => onSnooze(proposal.dedupeKey)}
            >
              あとで
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] underline"
              onClick={() => onDismiss(proposal.dedupeKey)}
            >
              非表示
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/**
 * AI Executive Assistant dashboard panel — proposals before the user asks.
 */
export function ExecutiveAssistantPanel({
  automations,
  projects,
  compact = false,
}: ExecutiveAssistantPanelProps) {
  const [dashboard, setDashboard] = useState<ExecutiveDashboard | null>(null);
  const [mode, setMode] = useState<SecretaryMode>("suggest_only");

  const rebuild = useCallback(() => {
    const settings = loadExecutiveAssistantSettings();
    setMode(settings.secretaryMode);
    if (settings.secretaryMode === "off") {
      setDashboard(null);
      return;
    }
    const profile = loadUserWorkProfile();
    const jobUsage = profile.frequentlyUsedJobs.map((job) => {
      const settings = profile.jobSettings[job.jobCategory as keyof typeof profile.jobSettings];
      return {
        jobCategory: job.jobCategory,
        label: job.label,
        count: job.count,
        lastUsedAt: job.lastUsedAt,
        frequency: settings?.frequency,
        preferredFormat: settings?.preferredFormat ?? profile.preferredFormats[job.jobCategory as keyof typeof profile.preferredFormats],
        preferredHour:
          settings?.preferredHour ??
          profile.preferredPostingTimes[job.jobCategory as keyof typeof profile.preferredPostingTimes]?.hour,
      };
    });

    const local = buildExecutiveDashboard({
      automations: automations.map((a) => ({
        id: a.id,
        name: a.name,
        enabled: a.enabled,
        schedule: a.schedule,
        lastRun: a.lastRun,
        nextRun: a.nextRun,
        workflow: a.workflow,
        status: a.status,
      })),
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        workRequest: p.workRequest,
        status: p.status,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
      })),
      jobUsage,
      secretaryMode: settings.secretaryMode,
      workStyle: settings.workStyle,
      dismissedKeys: settings.dismissedKeys,
      snoozedUntil: settings.snoozedUntil,
      maxProposals: compact ? 4 : 6,
    });
    setDashboard(local);

    // Enrich with server work-memory (best-effort)
    void fetch("/api/executive-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        automations: local.proposals.length
          ? automations.map((a) => ({
              id: a.id,
              name: a.name,
              enabled: a.enabled,
              schedule: a.schedule,
              lastRun: a.lastRun,
              nextRun: a.nextRun,
              workflow: a.workflow,
            }))
          : automations.map((a) => ({
              id: a.id,
              name: a.name,
              enabled: a.enabled,
              schedule: a.schedule,
              lastRun: a.lastRun,
              nextRun: a.nextRun,
              workflow: a.workflow,
            })),
        projects: projects.map((p) => ({
          id: p.id,
          title: p.title,
          workRequest: p.workRequest,
          status: p.status,
        })),
        jobUsage,
        secretaryMode: settings.secretaryMode,
        workStyle: settings.workStyle,
        dismissedKeys: settings.dismissedKeys,
        snoozedUntil: settings.snoozedUntil,
        maxProposals: compact ? 4 : 6,
      }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { dashboard?: ExecutiveDashboard };
      })
      .then((payload) => {
        if (payload?.dashboard) setDashboard(payload.dashboard);
      })
      .catch(() => undefined);
  }, [automations, projects, compact]);

  useEffect(() => {
    const timer = setTimeout(() => rebuild(), 0);
    return () => clearTimeout(timer);
  }, [rebuild]);

  if (mode === "off") {
    return (
      <div className="rounded-2xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--muted)]">
        秘書モードは OFF です。設定から提案を有効にできます。
      </div>
    );
  }

  if (!dashboard || dashboard.proposals.length === 0) {
    return (
      <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
        <p className="text-sm font-semibold">AI秘書からの提案</p>
        <p className="text-sm text-[var(--muted)]">
          いま緊急の提案はありません。履歴が集まると、先に仕事を見つけます。
        </p>
        <p className="text-xs text-[var(--muted)]">
          モード: {SECRETARY_MODE_LABELS[mode]}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-5",
        compact ? "text-left" : "rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4",
      )}
      aria-label="AI秘書からの提案"
    >
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-accent">
            AI Executive Assistant
          </p>
          <h2 className="text-base font-semibold">AI秘書からの提案</h2>
          <p className="text-xs text-[var(--muted)]">
            モード: {SECRETARY_MODE_LABELS[dashboard.secretaryMode]}
            {dashboard.suppressedCount > 0
              ? ` · 今日は他${dashboard.suppressedCount}件を抑制`
              : ""}
          </p>
        </div>
        <label className="text-xs text-[var(--muted)]">
          秘書モード
          <select
            className="ml-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1"
            value={mode}
            onChange={(e) => {
              const next = e.target.value as SecretaryMode;
              updateSecretaryMode(next);
              setMode(next);
              rebuild();
            }}
          >
            <option value="off">OFF</option>
            <option value="suggest_only">提案のみ</option>
            <option value="semi_auto">半自動</option>
            <option value="full_auto">完全自動</option>
          </select>
        </label>
      </header>

      <Section title="今日の提案">
        <div className="space-y-3">
          {dashboard.proposals.slice(0, compact ? 3 : 6).map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              onDismiss={(key) => {
                dismissExecutiveProposal(key);
                rebuild();
              }}
              onSnooze={(key) => {
                snoozeExecutiveProposal(key, 24);
                rebuild();
              }}
            />
          ))}
        </div>
      </Section>

      {!compact && dashboard.predictions.length > 0 ? (
        <Section title="仕事予測">
          <ul className="space-y-1 text-sm text-[var(--foreground-muted)]">
            {dashboard.predictions.map((p) => (
              <li key={p.id}>
                <Link href={p.actionHref} className="text-accent underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {!compact && dashboard.improvements.length > 0 ? (
        <Section title="今週見つけた改善">
          <ul className="space-y-1 text-sm text-[var(--foreground-muted)]">
            {dashboard.improvements.map((p) => (
              <li key={p.id}>
                {p.stars >= 4 ? "★★★★ " : ""}
                {p.title}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {!compact && dashboard.automationCandidates.length > 0 ? (
        <Section title="自動化候補">
          <ul className="space-y-1 text-sm">
            {dashboard.automationCandidates.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>
                  {"★".repeat(p.stars)} {p.title}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {p.automationScore}%
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {!compact && dashboard.recentMemory.length > 0 ? (
        <Section title="最近覚えたこと（仕事単位）">
          <ul className="space-y-2 text-sm text-[var(--foreground-muted)]">
            {dashboard.recentMemory.slice(0, 4).map((m) => (
              <li key={m.id}>
                <span className="font-medium text-foreground">{m.jobLabel}</span>
                <br />
                {m.steps.join(" → ")}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {!compact && dashboard.workStyle.length > 0 ? (
        <p className="text-xs text-[var(--muted)]">
          学習中の進め方: {dashboard.workStyle.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
