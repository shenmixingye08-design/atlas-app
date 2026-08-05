/**
 * Secretary mode policy — proposals only at this layer.
 * Never silently executes external side effects from discovery alone.
 * Full-auto still respects Approval-required steps (mail / X / publish).
 */

import type { ExecutiveProposal, SecretaryMode } from "./types";

const APPROVAL_REQUIRED_KINDS = new Set([
  "habit_delivery", // mail / X / share often need approval
]);

const APPROVAL_HINT =
  /メール|gmail|x投稿|twitter|公開|publish|承認|approval/i;

export function requiresHumanApproval(proposal: ExecutiveProposal): boolean {
  if (APPROVAL_REQUIRED_KINDS.has(proposal.kind) && /メール|x|投稿|送信/i.test(proposal.title + proposal.message)) {
    return true;
  }
  return APPROVAL_HINT.test(
    `${proposal.title} ${proposal.message} ${proposal.actionHref}`,
  );
}

/**
 * Whether full_auto may complete this work without asking again.
 * Deadlines / high-score recurring may auto-start draft pipelines;
 * Approval targets never auto-complete.
 */
export function canFullAutoComplete(proposal: ExecutiveProposal): boolean {
  if (requiresHumanApproval(proposal)) return false;
  if (proposal.kind === "deadline") return true;
  if (proposal.kind === "reply_miss") return false;
  return proposal.automationScore >= 95 && proposal.stars >= 4;
}

export function secretaryModeAllowsProposals(mode: SecretaryMode): boolean {
  return mode !== "off";
}

/** Soft auto: surface CTA as auto-run only when policy allows. */
export function applySecretaryModeCopy(
  proposal: ExecutiveProposal,
  mode: SecretaryMode,
): ExecutiveProposal {
  if (mode !== "full_auto" && mode !== "semi_auto") return proposal;
  if (!canFullAutoComplete(proposal)) {
    if (mode === "full_auto" && requiresHumanApproval(proposal)) {
      return {
        ...proposal,
        message: `${proposal.message}（承認が必要なため、確認後に進めます）`,
        actionLabel: "承認して進める",
      };
    }
    return proposal;
  }
  if (mode === "full_auto") {
    return {
      ...proposal,
      message: `${proposal.message} — 完全自動モードのため、承認不要の範囲で最後まで進められます。`,
      actionLabel: "自動で完了する",
    };
  }
  // semi_auto: one-tap confirm
  return {
    ...proposal,
    actionLabel: "半自動で進める",
  };
}
