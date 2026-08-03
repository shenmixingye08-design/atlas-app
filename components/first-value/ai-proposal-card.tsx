"use client";

import Link from "next/link";

import type { FirstValueProposal } from "@/lib/first-value";

/** Exactly one AI proposal — never a list. */
export function AiProposalCard({
  proposal,
}: {
  proposal: FirstValueProposal | null;
}) {
  return (
    <section
      aria-labelledby="fv-proposal-heading"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
    >
      <h2
        id="fv-proposal-heading"
        className="text-[length:var(--text-section)] font-semibold text-[var(--text-primary)]"
      >
        AI提案
      </h2>
      {!proposal ? (
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          利用履歴が貯まると、次に自動化できそうな仕事を1件だけご提案します。
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="font-semibold text-[var(--text-primary)]">
            {proposal.title}
          </p>
          <p className="text-sm text-[var(--text-secondary)]">{proposal.reason}</p>
          <Link
            href={proposal.href}
            className="inline-flex min-h-[40px] items-center text-sm font-semibold text-[var(--brand)] underline-offset-2 hover:underline"
          >
            この仕事を任せる
          </Link>
        </div>
      )}
    </section>
  );
}
