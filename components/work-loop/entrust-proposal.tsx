"use client";

import { useMemo, useState } from "react";

import { SectionHeader } from "@/components/automation-first/page-header";
import { createAutomation } from "@/lib/automations/client";
import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import {
  DELEGATION_HEADING,
  DISMISS_PROPOSAL,
  ENTRUST_CTA,
  ENTRUST_SECTION_HEADING,
  buildWorkCreateInput,
  classifyWorkKind,
  detectRepeatedWork,
  dismissProposal,
  fromDelegationLevel,
  listDismissedKeys,
  projectToSuccessfulJob,
  workFingerprint,
  type DelegationLevel,
  type WorkProposal,
} from "@/lib/work-loop";

function existingFingerprints(automations: readonly Automation[]): string[] {
  return automations.map((automation) =>
    workFingerprint({
      kind: classifyWorkKind({
        assignment: automation.workflow.assignment,
        title: automation.name,
      }),
      assignment: automation.workflow.assignment,
    }),
  );
}

function ProposalCard({
  proposal,
  userId,
  onDismissed,
  onCreated,
}: {
  proposal: WorkProposal;
  userId: string;
  onDismissed: () => void;
  onCreated?: () => void;
}) {
  const [frequency, setFrequency] = useState(proposal.cadence);
  const [delegation, setDelegation] = useState<DelegationLevel>(2);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrust() {
    setPending(true);
    setError(null);
    try {
      const built = buildWorkCreateInput({
        job: {
          id: proposal.id,
          userId: proposal.userId,
          title: proposal.title,
          assignment: proposal.assignment,
          completedAt: new Date().toISOString(),
          status: "completed",
        },
        schedule: { frequency, hour: 9, minute: 0 },
        executionLevel: fromDelegationLevel(delegation, proposal.kind),
        userId,
      });
      if (!built.ok) {
        setError(built.reason);
        return;
      }
      await createAutomation(built.createInput);
      dismissProposal(userId, proposal.fingerprint);
      onCreated?.();
      onDismissed();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登録できませんでした");
    } finally {
      setPending(false);
    }
  }

  return (
    <li
      data-testid="entrust-proposal"
      className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3.5 py-3"
    >
      <p className="text-sm font-semibold text-[var(--text-primary)]">{proposal.title}</p>
      <p className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
        {proposal.message}
      </p>
      <div className="flex flex-wrap gap-2" aria-label="頻度">
        {(["daily", "weekly", "monthly"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFrequency(value)}
            className="inline-flex min-h-[var(--touch-target)] items-center rounded-full border border-[var(--border)] px-3 text-sm"
            aria-pressed={frequency === value}
          >
            {value === "daily" ? "毎日" : value === "monthly" ? "毎月" : "毎週"}
          </button>
        ))}
      </div>
      <p className="text-[length:var(--text-meta)] text-[var(--text-muted)]">
        {DELEGATION_HEADING}
      </p>
      <div className="flex flex-wrap gap-2" aria-label={DELEGATION_HEADING}>
        {([1, 2, 3] as const).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setDelegation(level)}
            className="inline-flex min-h-[var(--touch-target)] items-center rounded-full border border-[var(--border)] px-3 text-sm"
            aria-pressed={delegation === level}
          >
            {level === 1 ? "提案のみ" : level === 2 ? "確認してから" : "自動で実行"}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="flex flex-wrap gap-2 pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          disabled={pending}
          onClick={() => void entrust()}
          className="inline-flex min-h-[var(--touch-target)] items-center rounded-full bg-[var(--brand)] px-4 text-sm font-semibold text-white"
        >
          {ENTRUST_CTA}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            dismissProposal(userId, proposal.fingerprint);
            onDismissed();
          }}
          className="inline-flex min-h-[var(--touch-target)] items-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold"
        >
          {DISMISS_PROPOSAL}
        </button>
      </div>
    </li>
  );
}

export function EntrustProposalList({
  projects,
  automations,
  userId,
  onCreated,
}: {
  projects: Project[];
  automations: Automation[];
  userId: string;
  onCreated?: () => void;
}) {
  const [tick, setTick] = useState(0);
  const proposals = useMemo(() => {
    const jobs = projects
      .map((project) => projectToSuccessfulJob(project, userId))
      .filter((job): job is NonNullable<typeof job> => Boolean(job));
    return detectRepeatedWork({
      userId,
      jobs,
      existingFingerprints: existingFingerprints(automations),
      dismissedKeys: listDismissedKeys(userId),
    });
  }, [projects, automations, userId, tick]);

  if (proposals.length === 0) return null;

  return (
    <section
      aria-labelledby="af-entrust-heading"
      data-testid="entrust-proposals"
      className="space-y-2.5"
    >
      <SectionHeader
        heading="h3"
        title={ENTRUST_SECTION_HEADING}
        description="繰り返している仕事だけ提案します"
      />
      <ul className="space-y-2">
        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.fingerprint}
            proposal={proposal}
            userId={userId}
            onDismissed={() => setTick((value) => value + 1)}
            onCreated={onCreated}
          />
        ))}
      </ul>
    </section>
  );
}
